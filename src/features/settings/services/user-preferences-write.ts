import { Prisma, type PrismaClient } from "@/generated/prisma_new/client"

/**
 * ÚNICO jeito de gravar em users.preferences_json: sempre por CHAVE, nunca o objeto inteiro.
 * Motivo: treze escritores regravavam o JSON completo e qualquer um deles podia desfazer um
 * fechamento de datas ou apagar o PIN (leitura velha, gravação nova). Aqui cada escrita toca só
 * a própria chave, no banco, numa instrução.
 *
 * Executor injetável: serve ao app (prisma), ao Setup (cliente próprio antes de DATABASE_URL
 * existir) e à vitrine da demo (dentro da transação licenciada). NUNCA importa "@/lib/prisma".
 */
export type PreferencesExecutor = Pick<PrismaClient, "$executeRaw" | "$queryRaw">

type ColumnType = "json" | "jsonb"
const columnTypeCache = new WeakMap<object, ColumnType>()

/** O banco pessoal do dono nunca rodou a migração init: pode ser json. Sonda pelo MESMO executor. */
async function columnType(executor: PreferencesExecutor): Promise<ColumnType> {
  const cached = columnTypeCache.get(executor)
  if (cached) return cached
  const rows = await executor.$queryRaw<Array<{ data_type: string }>>`
    SELECT data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'preferences_json'
  `
  const type: ColumnType = rows[0]?.data_type?.toLowerCase() === "json" ? "json" : "jsonb"
  columnTypeCache.set(executor, type)
  return type
}

const castBack = (type: ColumnType) => Prisma.raw(type === "json" ? "::json\n" : "::jsonb\n")

/**
 * A expressão como OBJETO garantido. `COALESCE` só cobre NULL do SQL: se a coluna guardar JSON
 * `null`, um escalar ou um array, `||` trata escalar como array de um item e a raiz inteira vira
 * `[null, {...}]` sem erro nenhum, e `jsonb_set` estoura "cannot set path in scalar". Aqui qualquer
 * coisa que não seja objeto vira `{}` — mesma recuperação que o COALESCE já dava para NULL.
 * Os `${}` daqui são só fragmentos SQL (Prisma.raw); todo valor continua parâmetro.
 */
const asObject = (expr: Prisma.Sql) =>
  Prisma.sql`(CASE WHEN jsonb_typeof(${expr}) = 'object' THEN ${expr} ELSE '{}'::jsonb END)`

/** Raiz da coluna já normalizada para objeto. */
const rootObject = () => asObject(Prisma.raw("preferences_json::jsonb"))

/** `JSON.stringify` devolve `undefined` para função/símbolo; NULL no parâmetro apagaria a coluna. */
const toJson = (value: unknown): string => JSON.stringify(value ?? null) ?? "null"

/** Mescla de um nível dentro da chave (só `dateClosing` usa: seus escritores gravam subcampos diferentes). */
export async function mergeUserPreferenceKey(
  executor: PreferencesExecutor,
  userId: string,
  key: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const type = await columnType(executor)
  const json = toJson(patch)
  const root = rootObject()
  // i18n-ignore: SQL bruto, não é texto de UI
  const affected = await executor.$executeRaw`
    UPDATE users SET preferences_json = (
      ${root}
      || jsonb_build_object(${key}::text,
        CASE WHEN jsonb_typeof(${root} -> ${key}::text) = 'object'
          THEN (${root} -> ${key}::text) || ${json}::jsonb
          ELSE ${json}::jsonb
        END)
    )${castBack(type)}
    WHERE id = ${userId}
  `
  if (affected === 0) throw new Error(`preferences not written for ${userId}`) // i18n-ignore: erro interno
}

/** Troca o valor inteiro da chave (todas as outras chaves: escalar, array ou objeto completo). */
export async function setUserPreferenceKey(
  executor: PreferencesExecutor,
  userId: string,
  key: string,
  value: unknown,
): Promise<void> {
  const type = await columnType(executor)
  const json = toJson(value)
  // i18n-ignore: SQL bruto, não é texto de UI
  const affected = await executor.$executeRaw`
    UPDATE users SET preferences_json = jsonb_set(
      ${rootObject()}, ARRAY[${key}::text], ${json}::jsonb, true
    )${castBack(type)}
    WHERE id = ${userId}
  `
  if (affected === 0) throw new Error(`preferences not written for ${userId}`) // i18n-ignore: erro interno
}

/** Várias chaves de uma vez, num único UPDATE (deleteBudgetCard mexe em duas). */
export async function writeUserPreferenceKeys(
  executor: PreferencesExecutor,
  userId: string,
  ops: Array<{ key: string; value: unknown }>,
): Promise<void> {
  if (ops.length === 0) return
  const type = await columnType(executor)
  const json = toJson(Object.fromEntries(ops.map((op) => [op.key, op.value ?? null])))
  // i18n-ignore: SQL bruto, não é texto de UI
  const affected = await executor.$executeRaw`
    UPDATE users SET preferences_json = (${rootObject()} || ${json}::jsonb)${castBack(type)}
    WHERE id = ${userId}
  `
  if (affected === 0) throw new Error(`preferences not written for ${userId}`) // i18n-ignore: erro interno
}

/**
 * Contador de erros de PIN calculado NO BANCO, numa instrução (rajada em paralelo não pula o
 * bloqueio). Devolve o contador novo e o bloqueio, se armou. O contador só é lido quando o valor
 * guardado é mesmo um número JSON, e ainda assim passa por numeric/trunc/limite: `"abc"`, `1.5` ou
 * um número gigante abortariam a instrução (`invalid input syntax for type integer`) e a tentativa
 * errada não seria contada — falha para o lado inseguro.
 */
export async function bumpPinFailure(
  executor: PreferencesExecutor,
  userId: string,
  lockAfter: number,
  lockMinutes: number,
  now: Date = new Date(),
): Promise<{ count: number; lockedUntil: string | null }> {
  const type = await columnType(executor)
  const lockedUntilIso = new Date(now.getTime() + lockMinutes * 60_000).toISOString()
  // i18n-ignore: SQL bruto, não é texto de UI
  const rows = await executor.$queryRaw<Array<{ count: number; locked_until: string | null }>>`
    WITH cur AS (
      SELECT id, ${rootObject()} AS p FROM users WHERE id = ${userId} FOR UPDATE
    ), calc AS (
      SELECT id, p,
        CASE WHEN jsonb_typeof(p -> 'dateClosing' -> 'pinFailures' -> 'count') = 'number'
          THEN LEAST(GREATEST(trunc((p -> 'dateClosing' -> 'pinFailures' ->> 'count')::numeric), 0), 1000000)::int
          ELSE 0 END + 1 AS c
      FROM cur
    )
    UPDATE users u SET preferences_json = (
      jsonb_set(calc.p, '{dateClosing}',
        ${asObject(Prisma.raw("calc.p -> 'dateClosing'"))}
        || jsonb_build_object('pinFailures',
          jsonb_build_object('count', calc.c,
            'lockedUntil', CASE WHEN calc.c >= ${lockAfter}::int THEN ${lockedUntilIso}::text ELSE NULL END)))
    )${castBack(type)}
    FROM calc WHERE u.id = calc.id
    RETURNING (u.preferences_json::jsonb -> 'dateClosing' -> 'pinFailures' ->> 'count')::int AS count,
              u.preferences_json::jsonb -> 'dateClosing' -> 'pinFailures' ->> 'lockedUntil' AS locked_until
  `
  const row = rows[0]
  if (!row) throw new Error(`preferences not written for ${userId}`) // i18n-ignore: erro interno
  return { count: Number(row.count ?? 0), lockedUntil: row.locked_until ?? null }
}

/** Só para testes. */
export function resetPreferencesColumnTypeCache(executor: object) {
  columnTypeCache.delete(executor)
}
