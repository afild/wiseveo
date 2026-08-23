import { Client } from "pg"
import { detectProviderFromUrl } from "../lib/connection-url"
import { checkUsersSchema, SCHEMA_OK, type SchemaCheck } from "../lib/schema-check"
import type { DbAudit, DbOwner } from "../lib/connection-result"
import type { MigrationQueryable } from "./prisma-migrations.service"

export type { DbAudit, DbOwner, ExistingChart } from "../lib/connection-result"

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
  | {
      ok: true
      hasData: boolean
      /** E-mail de quem está instalando, o que foi de fato procurado em `users`. */
      lookupEmail: string | null
      /** Usuário do banco cujo e-mail é o de quem está instalando; null = não existe lá. */
      owner: DbOwner | null
      /** Só quando não há dono: e-mails que existem em `users`, para a pessoa se localizar. */
      knownEmails: string[]
      audit: DbAudit | null
      schemaCheck: SchemaCheck
    }
  | { ok: false; code: DbConnectionErrorCode; detail: string }

/** Quantos e-mails listar quando o e-mail de quem instala não está no banco. */
const KNOWN_EMAILS_LIMIT = 20

const CONNECT_TIMEOUT_MS = 8000

/** Colunas reais da tabela `users` (só leitura) — usada no teste de conexão e no Finalizar. */
export async function readUsersColumns(client: MigrationQueryable): Promise<string[]> {
  const { rows } = await client.query(
    // i18n-ignore: SQL bruto, não é texto de UI
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users'`,
  )
  return rows.map((row) => String(row.column_name))
}

/** Usuário de `users` com este e-mail (sem diferenciar maiúsculas); null se não houver. */
async function findOwnerByEmail(client: MigrationQueryable, email: string): Promise<DbOwner | null> {
  const { rows } = await client.query(
    // i18n-ignore: SQL bruto, não é texto de UI
    `SELECT id, email FROM users WHERE lower(email) = lower($1) LIMIT 1`,
    [email],
  )
  const row = rows[0]
  return row ? { id: String(row.id), email: String(row.email) } : null
}

/** E-mails já cadastrados (só leitura), para a tela dizer o que existe no banco. */
async function readKnownEmails(client: MigrationQueryable): Promise<string[]> {
  const { rows } = await client.query(
    // i18n-ignore: SQL bruto, não é texto de UI
    `SELECT email FROM users ORDER BY created_at ASC LIMIT ${KNOWN_EMAILS_LIMIT}`,
  )
  return rows.map((row) => String(row.email))
}

/**
 * Números e conteúdo do plano de contas DO DONO (nunca do banco inteiro: o mesmo
 * banco pode ter linhas de outros `user_id`). Formato inesperado → null.
 */
async function readOwnerAudit(client: MigrationQueryable, ownerId: string): Promise<DbAudit | null> {
  try {
    // i18n-ignore: strings SQL brutas, não são texto de UI
    const [accountsRes, transactionsRes, categoriesRes, groupsRes] = await Promise.all([
      client.query('SELECT "COD_ACC" as id, "CONTA" as name, "TIPO" as type FROM accounts WHERE user_id = $1', [ownerId]), // i18n-ignore
      client.query("SELECT COUNT(*) FROM transactions WHERE user_id = $1", [ownerId]), // i18n-ignore
      client.query('SELECT id, "COD_CAT" as code, "CATEGORIA" as name, "TIPO" as type, group_id FROM categories WHERE user_id = $1', [ownerId]), // i18n-ignore
      client.query('SELECT id, "COD_GRU" as code, "GRUPO" as name, type FROM category_groups WHERE user_id = $1', [ownerId]), // i18n-ignore
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

    return {
      accounts: accountsRes.rows.length,
      transactions: parseInt(String(transactionsRes.rows[0]?.count ?? "0"), 10),
      categories: categoriesRes.rows.length,
      groups: groupsRes.rows.length,
      existingChart: { groups, accounts },
    }
  } catch {
    // Sem números: o wizard mostra a conexão como válida e sem auditoria.
    return null
  }
}

/**
 * @param adminEmail e-mail de quem está instalando (Google/cadastro). A auditoria
 * mostra SÓ os dados desse usuário — o banco pode ter linhas de outros `user_id`.
 */
export async function testDatabaseConnection(
  connectionString: string,
  options: { adminEmail?: string | null } = {},
): Promise<DbConnectionResult> {
  // Sem SSL forçado aqui: espelha o que o app fará em produção com a mesma URL.
  const client = new Client({ connectionString, connectionTimeoutMillis: CONNECT_TIMEOUT_MS })

  try {
    await client.connect()
  } catch (e) {
    return { ok: false, code: classifyConnectionError(e, connectionString), detail: errorMessage(e) }
  }

  let hasData = false
  let audit: DbAudit | null = null
  const lookupEmail = options.adminEmail?.trim() || null
  let owner: DbOwner | null = null
  let knownEmails: string[] = []
  let schemaCheck: SchemaCheck = SCHEMA_OK

  try {
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'transactions'
      );
    `)
    hasData = tableCheck.rows[0]?.exists === true
  } catch {
    // Sem acesso ao information_schema: trata como banco novo (comportamento anterior).
  }

  if (hasData) {
    // 1) Estrutura PRIMEIRO, independente do formato das tabelas financeiras. Falha
    //    aqui (permissão/conexão) é erro real: nunca devolver "compatível" sem ter lido.
    try {
      schemaCheck = checkUsersSchema(await readUsersColumns(client))
    } catch (e) {
      await client.end().catch(() => {})
      return { ok: false, code: "unknown", detail: errorMessage(e) }
    }

    // 2) Dono: o e-mail de quem está instalando tem de existir em `users`. Sem ele
    //    não há o que auditar — o banco é de outra pessoa (ou o e-mail está errado).
    try {
      owner = lookupEmail ? await findOwnerByEmail(client, lookupEmail) : null
      if (!owner) knownEmails = await readKnownEmails(client)
    } catch {
      // `users` fora do formato esperado: a checagem de estrutura acima já bloqueia.
    }

    // 3) Auditoria — SÓ os dados do dono e só informativa: tabela financeira com outro
    //    formato não invalida a conexão nem a checagem de estrutura.
    if (owner) audit = await readOwnerAudit(client, owner.id)
  }

  await client.end().catch(() => {})
  return { ok: true, hasData, lookupEmail, owner, knownEmails, audit, schemaCheck }
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
