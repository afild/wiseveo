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

/** Mescla de um nível dentro da chave (só `dateClosing` usa: seus escritores gravam subcampos diferentes). */
export async function mergeUserPreferenceKey(
  executor: PreferencesExecutor,
  userId: string,
  key: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const type = await columnType(executor)
  const json = JSON.stringify(patch)
  // i18n-ignore: SQL bruto, não é texto de UI
  const affected = await executor.$executeRaw`
    UPDATE users SET preferences_json = (
      COALESCE(preferences_json::jsonb, '{}'::jsonb)
      || jsonb_build_object(${key}::text,
        CASE WHEN jsonb_typeof(COALESCE(preferences_json::jsonb, '{}'::jsonb) -> ${key}::text) = 'object'
          THEN (preferences_json::jsonb -> ${key}::text) || ${json}::jsonb
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
  const json = JSON.stringify(value ?? null)
  // i18n-ignore: SQL bruto, não é texto de UI
  const affected = await executor.$executeRaw`
    UPDATE users SET preferences_json = jsonb_set(
      COALESCE(preferences_json::jsonb, '{}'::jsonb), ARRAY[${key}::text], ${json}::jsonb, true
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
  const json = JSON.stringify(Object.fromEntries(ops.map((op) => [op.key, op.value ?? null])))
  // i18n-ignore: SQL bruto, não é texto de UI
  const affected = await executor.$executeRaw`
    UPDATE users SET preferences_json = (COALESCE(preferences_json::jsonb, '{}'::jsonb) || ${json}::jsonb)${castBack(type)}
    WHERE id = ${userId}
  `
  if (affected === 0) throw new Error(`preferences not written for ${userId}`) // i18n-ignore: erro interno
}

/**
 * Contador de erros de PIN calculado NO BANCO, numa instrução (rajada em paralelo não pula o
 * bloqueio). Devolve o contador novo e o bloqueio, se armou.
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
      SELECT id, COALESCE(preferences_json::jsonb, '{}'::jsonb) AS p FROM users WHERE id = ${userId} FOR UPDATE
    ), calc AS (
      SELECT id, p, COALESCE((p -> 'dateClosing' -> 'pinFailures' ->> 'count')::int, 0) + 1 AS c FROM cur
    )
    UPDATE users u SET preferences_json = (
      jsonb_set(calc.p, '{dateClosing}',
        (CASE WHEN jsonb_typeof(calc.p -> 'dateClosing') = 'object' THEN calc.p -> 'dateClosing' ELSE '{}'::jsonb END)
        || jsonb_build_object('pinFailures',
          jsonb_build_object('count', calc.c,
            'lockedUntil', CASE WHEN calc.c >= ${lockAfter}::int THEN ${lockedUntilIso}::text ELSE NULL END)))
    )${castBack(type)}
    FROM calc WHERE u.id = calc.id
    RETURNING (u.preferences_json::jsonb -> 'dateClosing' -> 'pinFailures' ->> 'count')::int AS count,
              u.preferences_json::jsonb -> 'dateClosing' -> 'pinFailures' ->> 'lockedUntil' AS locked_until
  `
  return { count: Number(rows[0]?.count ?? 0), lockedUntil: rows[0]?.locked_until ?? null }
}

/** Só para testes. */
export function resetPreferencesColumnTypeCache(executor: object) {
  columnTypeCache.delete(executor)
}
