import { type PrismaClient } from "@/generated/prisma_new/client"

/**
 * ÚNICO jeito de gravar em users.preferences_json: sempre por CHAVE, nunca o objeto inteiro.
 * Motivo: treze escritores regravavam o JSON completo e qualquer um deles podia desfazer um
 * fechamento de datas ou apagar o PIN (leitura velha, gravação nova). Aqui cada escrita toca só
 * a própria chave, no banco, numa instrução.
 *
 * Executor injetável: serve ao app (prisma), ao Setup (cliente próprio antes de DATABASE_URL
 * existir) e à vitrine da demo (dentro da transação licenciada). NUNCA importa "@/lib/prisma".
 *
 * TRANSPORTE: texto de SQL montado aqui + array de valores (`$queryRawUnsafe`). NUNCA um template
 * marcado com fragmentos `Prisma.sql`/`Prisma.raw` dentro dos `${}`. Fragmento aninhado só é
 * emendado no texto quando passa num `instanceof Sql`, e esse teste compara com a classe da CÓPIA
 * do cliente Prisma que montou o template. Dentro do Next há mais de uma cópia do módulo gerado
 * (a camada dos Server Components e a das rotas são bundles distintos, com `Prisma.raw` diferentes),
 * e o cliente é um só, memorizado em globalThis: se quem criou o cliente não foi a mesma cópia que
 * montou o fragmento, o `instanceof` dá falso e o FRAGMENTO VIRA PARÂMETRO. O banco então recebia
 * `)$9` no lugar do `::jsonb` e devolvia `syntax error at or near "$9"` — o PIN nunca era gravado
 * dentro do app, embora o mesmo código passasse no tsx e nos testes (uma cópia só do módulo).
 * Aqui não há fragmento nenhum: o texto é fixo deste arquivo e tudo que varia é parâmetro.
 */
export type PreferencesExecutor = Pick<PrismaClient, "$executeRaw" | "$queryRaw" | "$queryRawUnsafe">

type ColumnType = "json" | "jsonb"
const columnTypeCache = new WeakMap<object, ColumnType>()

/** O banco pessoal do dono nunca rodou a migração init: pode ser json. Sonda pelo MESMO executor. */
async function columnType(executor: PreferencesExecutor): Promise<ColumnType> {
  const cached = columnTypeCache.get(executor)
  if (cached) return cached
  const rows = await executor.$queryRawUnsafe<Array<{ data_type: string }>>(
    // i18n-ignore: SQL bruto, não é texto de UI
    `SELECT data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'preferences_json'`,
  )
  const type: ColumnType = rows[0]?.data_type?.toLowerCase() === "json" ? "json" : "jsonb"
  columnTypeCache.set(executor, type)
  return type
}

/** Único texto escolhido em tempo de execução — e a escolha é entre DOIS literais deste arquivo. */
const castBack = (type: ColumnType): string => (type === "json" ? "::json\n" : "::jsonb\n")

/**
 * A expressão como OBJETO garantido. `COALESCE` só cobre NULL do SQL: se a coluna guardar JSON
 * `null`, um escalar ou um array, `||` trata escalar como array de um item e a raiz inteira vira
 * `[null, {...}]` sem erro nenhum, e `jsonb_set` estoura "cannot set path in scalar". Aqui qualquer
 * coisa que não seja objeto vira `{}` — mesma recuperação que o COALESCE já dava para NULL.
 * Vale para os DOIS lados do `||`: a coluna E o parâmetro (um patch array concatenava de verdade).
 *
 * O argumento é uma UNIÃO FECHADA de literais escritos aqui: o TypeScript recusa qualquer texto
 * vindo de fora, então nada derivado de entrada do usuário chega a ser concatenado no SQL.
 */
type FixedExpr = "users.preferences_json::jsonb" | "calc.p -> 'dateClosing'" | "$2::jsonb" | "$3::jsonb"
const asObject = (expr: FixedExpr) =>
  `(CASE WHEN jsonb_typeof(${expr}) = 'object' THEN ${expr} ELSE '{}'::jsonb END)`

/** Raiz da coluna já normalizada para objeto. */
const ROOT = asObject("users.preferences_json::jsonb")

type WriteRow = { prev_type: string | null }

/**
 * Rabicho comum das três escritas simples: a MESMA instrução tira a foto de ANTES. O `FROM`
 * enxerga a linha no estado velho, então o `RETURNING` consegue dizer que tipo a raiz tinha antes
 * de o guarda trocá-la por `{}`. Continua UMA instrução por escrita: um segundo comando abriria
 * janela para outra escrita entrar no meio. Nas três, o id do usuário é sempre `$1`.
 */
const WITH_PREVIOUS_ROOT = `FROM (SELECT id, preferences_json AS prev FROM users WHERE id = $1) src
    WHERE users.id = src.id
    RETURNING jsonb_typeof(src.prev::jsonb) AS prev_type`

/**
 * A recuperação silenciosa (raiz não-objeto vira `{}`) apaga TODAS as chaves, PIN e corte junto.
 * No banco do dono isso não pode passar sem rastro. Raiz NULL do SQL não avisa: não havia nada
 * para perder — era exatamente o caso que o COALESCE antigo já cobria.
 */
function warnCorruptRoot(fn: string, userId: string, prevType: string | null): void {
  if (prevType === null || prevType === "object") return
  console.warn(
    `[preferences] ${fn}: users.preferences_json for ${userId} was ${prevType}, not an object; every key was reset to {}`,
  )
}

/** Sem linha devolvida = nada foi gravado. Mensagem idêntica à de antes. */
function assertWritten(rows: WriteRow[], userId: string, fn: string): void {
  const row = rows[0]
  if (!row) throw new Error(`preferences not written for ${userId}`) // i18n-ignore: erro interno
  warnCorruptRoot(fn, userId, row.prev_type ?? null)
}

/**
 * `JSON.stringify` OMITE a propriedade cujo valor é função, símbolo ou `undefined`: a chave sumia
 * da instrução e a escrita "dava certo" sem gravar nada, enquanto `setUserPreferenceKey` com o
 * MESMO valor gravava `null`. Aqui os três viram `null` em qualquer profundidade, e as quatro
 * funções passam a gravar sempre.
 */
const nullForUnserializable = (_key: string, value: unknown) =>
  value === undefined || typeof value === "function" || typeof value === "symbol" ? null : value

/** Valor de topo sem serialização ainda cairia em `undefined`; NULL no parâmetro apagaria a coluna. */
const toJson = (value: unknown): string => JSON.stringify(value, nullForUnserializable) ?? "null"

/** Mescla de um nível dentro da chave (`dateClosing` e `backup`: seus escritores gravam subcampos diferentes). */
export async function mergeUserPreferenceKey(
  executor: PreferencesExecutor,
  userId: string,
  key: string,
  patch: Record<string, unknown>,
): Promise<void> {
  // `[1,2] as any` chegava até o `||` e concatenava de verdade: dateClosing virava [{...},1,2].
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) {
    throw new Error(`preferences patch must be an object for ${userId}`) // i18n-ignore: erro interno
  }
  const type = await columnType(executor)
  const patchObject = asObject("$3::jsonb")
  // $1 = userId, $2 = chave, $3 = patch em JSON. i18n-ignore: SQL bruto, não é texto de UI
  const rows = await executor.$queryRawUnsafe<WriteRow[]>(
    `
    UPDATE users SET preferences_json = (
      ${ROOT}
      || jsonb_build_object($2::text,
        CASE WHEN jsonb_typeof(${ROOT} -> $2::text) = 'object'
          THEN (${ROOT} -> $2::text) || ${patchObject}
          ELSE ${patchObject}
        END)
    )${castBack(type)}
    ${WITH_PREVIOUS_ROOT}
  `,
    userId,
    key,
    toJson(patch),
  )
  assertWritten(rows, userId, "mergeUserPreferenceKey")
}

/** Troca o valor inteiro da chave (todas as outras chaves: escalar, array ou objeto completo). */
export async function setUserPreferenceKey(
  executor: PreferencesExecutor,
  userId: string,
  key: string,
  value: unknown,
): Promise<void> {
  const type = await columnType(executor)
  // $1 = userId, $2 = chave, $3 = valor em JSON. i18n-ignore: SQL bruto, não é texto de UI
  const rows = await executor.$queryRawUnsafe<WriteRow[]>(
    `
    UPDATE users SET preferences_json = jsonb_set(
      ${ROOT}, ARRAY[$2::text], $3::jsonb, true
    )${castBack(type)}
    ${WITH_PREVIOUS_ROOT}
  `,
    userId,
    key,
    toJson(value),
  )
  assertWritten(rows, userId, "setUserPreferenceKey")
}

/** Várias chaves de uma vez, num único UPDATE (deleteBudgetCard mexe em duas). */
export async function writeUserPreferenceKeys(
  executor: PreferencesExecutor,
  userId: string,
  ops: Array<{ key: string; value: unknown }>,
): Promise<void> {
  if (ops.length === 0) return
  const type = await columnType(executor)
  // $1 = userId, $2 = as chaves num objeto JSON. i18n-ignore: SQL bruto, não é texto de UI
  const rows = await executor.$queryRawUnsafe<WriteRow[]>(
    `
    UPDATE users SET preferences_json = (${ROOT} || ${asObject("$2::jsonb")})${castBack(type)}
    ${WITH_PREVIOUS_ROOT}
  `,
    userId,
    toJson(Object.fromEntries(ops.map((op) => [op.key, op.value]))),
  )
  assertWritten(rows, userId, "writeUserPreferenceKeys")
}

/**
 * O `lockedUntil` guardado só é comparado como instante quando tem a forma exata que o app grava
 * (`toISOString()`, sempre em UTC com `Z`). Duas armadilhas que abortariam a instrução inteira e
 * fariam a tentativa errada não ser contada — o mesmo lado inseguro que o `trunc`/limite do contador
 * já evitava: um texto sem fuso (`2026-09-02T12:00:00`) estoura "cannot convert value from
 * timestamp to timestamptz", e uma data impossível (`2026-02-31T…`) estoura no parse. O regex mata a
 * primeira; o `silent := true` do `jsonb_path_exists` engole a segunda e devolve `false`. Qualquer
 * valor que não passe nos dois é lido como "sem bloqueio" — quer dizer, como bloqueio vencido.
 */
const ISO_INSTANT_RE = "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?Z$"

/**
 * Contador de erros de PIN calculado NO BANCO, numa instrução (rajada em paralelo não pula o
 * bloqueio). Devolve o contador novo e o bloqueio, se armou. O contador só é lido quando o valor
 * guardado é mesmo um número JSON, e ainda assim passa por numeric/trunc/limite: `"abc"`, `1.5` ou
 * um número gigante abortariam a instrução (`invalid input syntax for type integer`) e a tentativa
 * errada não seria contada — falha para o lado inseguro.
 *
 * O bloqueio VENCIDO também é decidido aqui, na mesma instrução travada. Antes quem chamava lia a
 * linha sem trava, zerava o contador num UPDATE à parte e só então incrementava: numa rajada,
 * `zera₁, conta₁, zera₂, conta₂, …` prendia o contador em 1 e o número de palpites de graça passava
 * a depender do paralelismo do atacante, não do limite de cinco; pior, um pedido atrasado podia
 * gravar o zero DEPOIS de um bloqueio novo ter armado, apagando-o.
 *
 * `now` é o MESMO instante que decide se o bloqueio guardado ainda vale e que monta o bloqueio novo.
 * Bloqueio vencido zera o contador antes do incremento (a tentativa vira a 1ª de cinco novas) e o
 * `lockedUntil` velho sai junto; bloqueio ainda de pé apenas incrementa e rearma — recusar cedo é
 * papel de quem chama, não desta instrução. Ausência de `lockedUntil` NÃO zera nada: é assim que
 * 1, 2, 3, 4 se acumulam.
 */
export async function bumpPinFailure(
  executor: PreferencesExecutor,
  userId: string,
  lockAfter: number,
  lockMinutes: number,
  now: Date = new Date(),
): Promise<{ count: number; lockedUntil: string | null }> {
  const type = await columnType(executor)
  const nowIso = now.toISOString()
  const lockedUntilIso = new Date(now.getTime() + lockMinutes * 60_000).toISOString()
  // $1 = userId, $2 = regex do instante, $3 = agora, $4 = limite, $5 = novo bloqueio.
  // O `$ref` e o `$.dateClosing` abaixo moram DENTRO de literais de texto do SQL: o Postgres só lê
  // `$n` como parâmetro fora de aspas, então eles continuam sendo caminho de jsonpath.
  // i18n-ignore: SQL bruto, não é texto de UI
  const rows = await executor.$queryRawUnsafe<
    Array<{ count: number; locked_until: string | null; prev_type: string | null }>
  >(
    `
    WITH cur AS (
      SELECT id, preferences_json AS prev, ${ROOT} AS p FROM users WHERE id = $1 FOR UPDATE
    ), lock_state AS (
      SELECT id, prev, p,
        COALESCE(jsonb_typeof(p -> 'dateClosing' -> 'pinFailures' -> 'lockedUntil'), 'null') <> 'null' AS had_lock,
        CASE WHEN (p -> 'dateClosing' -> 'pinFailures' ->> 'lockedUntil') ~ $2::text
          THEN jsonb_path_exists(p,
            '$.dateClosing.pinFailures.lockedUntil ? (@.datetime() > $ref.datetime())',
            jsonb_build_object('ref', $3::text), true)
          ELSE false END AS still_locked
      FROM cur
    ), calc AS (
      SELECT id, prev, p,
        CASE WHEN had_lock AND NOT still_locked THEN 0
          WHEN jsonb_typeof(p -> 'dateClosing' -> 'pinFailures' -> 'count') = 'number'
          THEN LEAST(GREATEST(trunc((p -> 'dateClosing' -> 'pinFailures' ->> 'count')::numeric), 0), 1000000)::int
          ELSE 0 END + 1 AS c
      FROM lock_state
    )
    UPDATE users u SET preferences_json = (
      jsonb_set(calc.p, '{dateClosing}',
        ${asObject("calc.p -> 'dateClosing'")}
        || jsonb_build_object('pinFailures',
          jsonb_build_object('count', calc.c,
            'lockedUntil', CASE WHEN calc.c >= $4::int THEN $5::text ELSE NULL END)))
    )${castBack(type)}
    FROM calc WHERE u.id = calc.id
    RETURNING (u.preferences_json::jsonb -> 'dateClosing' -> 'pinFailures' ->> 'count')::int AS count,
              u.preferences_json::jsonb -> 'dateClosing' -> 'pinFailures' ->> 'lockedUntil' AS locked_until,
              jsonb_typeof(calc.prev::jsonb) AS prev_type
  `,
    userId,
    ISO_INSTANT_RE,
    nowIso,
    lockAfter,
    lockedUntilIso,
  )
  const row = rows[0]
  if (!row) throw new Error(`preferences not written for ${userId}`) // i18n-ignore: erro interno
  warnCorruptRoot("bumpPinFailure", userId, row.prev_type ?? null)
  return { count: Number(row.count ?? 0), lockedUntil: row.locked_until ?? null }
}

/** Só para testes. */
export function resetPreferencesColumnTypeCache(executor: object) {
  columnTypeCache.delete(executor)
}
