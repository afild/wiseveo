import { Client } from "pg"
import { detectProviderFromUrl } from "../lib/connection-url"
import { checkUsersSchema, SCHEMA_OK, type SchemaCheck } from "../lib/schema-check"
import type { DbAudit } from "../lib/connection-result"
import type { MigrationQueryable } from "./prisma-migrations.service"

export type { DbAudit, ExistingChart } from "../lib/connection-result"

/**
 * Teste de conexão do Setup Wizard. Devolve códigos ESTÁVEIS (as rotas
 * traduzem com getTranslations("api.setup.errors")) e nunca inclui a URL
 * nem a senha em nada que saia daqui.
 */

export type DbConnectionErrorCode =
  | "invalidPassword"
  | "hostNotFound"
  | "ipv6Unreachable"
  | "timeout"
  | "dbNotFound"
  | "sslRequired"
  | "unknown"

export type DbConnectionResult =
  | { ok: true; hasData: boolean; audit: DbAudit | null; schemaCheck: SchemaCheck }
  | { ok: false; code: DbConnectionErrorCode; detail: string }

const CONNECT_TIMEOUT_MS = 8000

/** Colunas reais da tabela `users` (só leitura) — usada no teste de conexão e no Finalizar. */
export async function readUsersColumns(client: MigrationQueryable): Promise<string[]> {
  const { rows } = await client.query(
    // i18n-ignore: SQL bruto, não é texto de UI
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users'`,
  )
  return rows.map((row) => String(row.column_name))
}

export async function testDatabaseConnection(connectionString: string): Promise<DbConnectionResult> {
  // Sem SSL forçado aqui: espelha o que o app fará em produção com a mesma URL.
  const client = new Client({ connectionString, connectionTimeoutMillis: CONNECT_TIMEOUT_MS })

  try {
    await client.connect()
  } catch (e) {
    return { ok: false, code: classifyConnectionError(e, connectionString), detail: errorMessage(e) }
  }

  let hasData = false
  let audit: DbAudit | null = null
  let schemaCheck: SchemaCheck = SCHEMA_OK

  try {
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'transactions'
      );
    `)

    if (tableCheck.rows[0]?.exists) {
      hasData = true
      // i18n-ignore: strings SQL brutas, não são texto de UI
      const [accountsRes, transactionsRes, categoriesRes, groupsRes] = await Promise.all([
        client.query('SELECT "COD_ACC" as id, "CONTA" as name, "TIPO" as type FROM accounts'), // i18n-ignore
        client.query("SELECT COUNT(*) FROM transactions"), // i18n-ignore
        client.query('SELECT id, "COD_CAT" as code, "CATEGORIA" as name, "TIPO" as type, group_id FROM categories'), // i18n-ignore
        client.query('SELECT id, "COD_GRU" as code, "GRUPO" as name, type FROM category_groups'), // i18n-ignore
      ])

      const groups = groupsRes.rows.map((g) => ({
        id: g.id,
        code: g.code,
        name: g.name,
        type: g.type,
        categories: categoriesRes.rows
          .filter((c) => c.group_id === g.id)
          .map((c) => ({ id: c.id, code: c.code, name: c.name, type: c.type })),
      }))
      const accounts = accountsRes.rows.map((a) => ({ id: a.id, name: a.name, type: a.type }))

      audit = {
        accounts: accountsRes.rows.length,
        transactions: parseInt(transactionsRes.rows[0].count, 10),
        categories: categoriesRes.rows.length,
        groups: groupsRes.rows.length,
        existingChart: { groups, accounts },
      }

      // Estrutura: esta versão precisa de certas colunas em `users` (ex.: data_owner_id).
      // Só informa — quem bloqueia é a tela (Próximo) e o Finalizar (servidor).
      schemaCheck = checkUsersSchema(await readUsersColumns(client))
    }
  } catch {
    // Tabelas do WISEVEO ausentes ou com outro formato: banco tratado como novo.
  } finally {
    await client.end().catch(() => {})
  }

  return { ok: true, hasData, audit, schemaCheck }
}

/** Mapeia o erro do `pg` (SQLSTATE ou código de rede) para um código estável. */
export function classifyConnectionError(error: unknown, connectionString: string): DbConnectionErrorCode {
  const err = (error ?? {}) as { code?: string; message?: string; errors?: Array<{ code?: string }> }
  const codes = new Set<string>()
  if (err.code) codes.add(err.code)
  // AggregateError (várias tentativas IPv4/IPv6) carrega os códigos em .errors
  for (const inner of err.errors ?? []) if (inner?.code) codes.add(inner.code)
  const message = (err.message ?? "").toLowerCase()

  if (codes.has("28P01") || codes.has("28000")) return "invalidPassword"
  if (codes.has("3D000")) return "dbNotFound"
  if (codes.has("ENOTFOUND") || codes.has("EAI_AGAIN")) return "hostNotFound"
  if (codes.has("ENETUNREACH") || codes.has("EHOSTUNREACH")) {
    return detectProviderFromUrl(connectionString) === "supabase-direct" ? "ipv6Unreachable" : "timeout"
  }
  if (codes.has("ETIMEDOUT") || codes.has("ECONNREFUSED") || message.includes("timeout")) return "timeout"
  if (message.includes("ssl") || message.includes("tls")) return "sslRequired"
  if (message.includes("password authentication failed")) return "invalidPassword"
  return "unknown"
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
