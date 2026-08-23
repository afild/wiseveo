import { beforeEach, describe, expect, it, vi } from "vitest"
import { REQUIRED_USERS_COLUMNS } from "../src/features/setup/lib/schema-check"

/**
 * `pg` dublado: cada consulta é respondida pelo primeiro fragmento de SQL que casar.
 * Fragmentos distintos para não confundir "COUNT(*) FROM transactions" com a checagem
 * "table_name = 'transactions'".
 */
const m = vi.hoisted(() => ({
  script: [] as Array<[fragment: string, rows: unknown[] | Error]>,
  queries: [] as string[],
  params: [] as Array<unknown[] | undefined>,
  connectError: null as Error | null,
}))

vi.mock("pg", () => {
  class Client {
    async connect() {
      if (m.connectError) throw m.connectError
    }
    async end() {}
    async query(text: string, values?: unknown[]) {
      m.queries.push(text)
      m.params.push(values)
      const hit = m.script.find(([fragment]) => text.includes(fragment))
      if (hit && hit[1] instanceof Error) throw hit[1]
      return { rows: hit ? hit[1] : [] }
    }
  }
  return { Client }
})

import { readUsersColumns, testDatabaseConnection } from "../src/features/setup/services/db-connection.service"

const URL = "postgresql://postgres.ref:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
const ADMIN = { adminEmail: "Dono@Example.com" }
const columnRows = (cols: readonly string[]) => cols.map((column_name) => ({ column_name }))

function scriptWithData(users: readonly string[], owner: unknown[] = [{ id: "u-dono", email: "dono@example.com" }]) {
  m.script = [
    ["table_name = 'transactions'", [{ exists: true }]],
    ["lower(email)", owner],
    ["FROM users ORDER BY created_at", [{ email: "outra@example.com" }, { email: "terceira@example.com" }]],
    ["COUNT(*) FROM transactions", [{ count: "14203" }]],
    ["FROM accounts", [{ id: 1, name: "DEFINIR", type: "CHECKING" }, { id: 2, name: "BOFA - A/F", type: "CHECKING" }]],
    ["FROM category_groups", [{ id: "g1", code: 100, name: "RECEITAS", type: "INCOME" }]],
    ["FROM categories", [{ id: "c1", code: "100.001", name: "Salário", type: "INCOME", group_id: "g1" }]],
    ["information_schema.columns", columnRows(users)],
  ]
}

describe("testDatabaseConnection — auditoria + checagem de estrutura", () => {
  beforeEach(() => {
    m.script = []
    m.queries = []
    m.params = []
    m.connectError = null
  })

  it("banco com dados e colunas completas → hasData, dono encontrado, audit com números e schemaCheck ok", async () => {
    scriptWithData(REQUIRED_USERS_COLUMNS)
    const result = await testDatabaseConnection(URL, ADMIN)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.hasData).toBe(true)
    expect(result.owner).toEqual({ id: "u-dono", email: "dono@example.com" })
    expect(result.lookupEmail).toBe("Dono@Example.com")
    expect(result.knownEmails).toEqual([])
    expect(result.audit).toMatchObject({ accounts: 2, transactions: 14203, categories: 1, groups: 1 })
    expect(result.audit?.existingChart.groups[0]).toMatchObject({ name: "RECEITAS", categories: [{ code: "100.001" }] })
    expect(result.schemaCheck).toEqual({ ok: true, missingColumns: [] })
  })

  it("auditoria consulta SÓ as linhas do dono (WHERE user_id = id dele), nunca o banco inteiro", async () => {
    scriptWithData(REQUIRED_USERS_COLUMNS)
    await testDatabaseConnection(URL, ADMIN)

    const financeiras = m.queries
      .map((text, i) => ({ text, values: m.params[i] }))
      .filter(({ text }) => /FROM (accounts|transactions|categories|category_groups)/.test(text) && !text.includes("information_schema"))
    expect(financeiras).toHaveLength(4)
    for (const q of financeiras) {
      expect(q.text).toContain("user_id = $1")
      expect(q.values).toEqual(["u-dono"])
    }
    // O e-mail é procurado sem diferenciar maiúsculas, como o login faz.
    const lookup = m.queries.findIndex((q) => q.includes("lower(email)"))
    expect(m.params[lookup]).toEqual(["Dono@Example.com"])
  })

  it("e-mail do login não existe no banco → sem dono, sem auditoria e com os e-mails encontrados", async () => {
    scriptWithData(REQUIRED_USERS_COLUMNS, [])
    const result = await testDatabaseConnection(URL, ADMIN)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.owner).toBeNull()
    // A tela nomeia o e-mail que o SERVIDOR procurou, não o digitado no formulário.
    expect(result.lookupEmail).toBe("Dono@Example.com")
    expect(result.audit).toBeNull()
    expect(result.knownEmails).toEqual(["outra@example.com", "terceira@example.com"])
    expect(result.schemaCheck).toEqual({ ok: true, missingColumns: [] })
    expect(m.queries.some((q) => q.includes("FROM accounts"))).toBe(false)
  })

  it("banco com dados sem google_token_expires_at → schemaCheck aponta a coluna (a conexão continua ok)", async () => {
    scriptWithData(REQUIRED_USERS_COLUMNS.filter((c) => c !== "google_token_expires_at"))
    const result = await testDatabaseConnection(URL, ADMIN)
    expect(result.ok && result.hasData).toBe(true)
    expect(result.ok && result.schemaCheck).toEqual({ ok: false, missingColumns: ["google_token_expires_at"] })
  })

  it("banco vazio → hasData=false, sem audit, schemaCheck ok e SEM consultar colunas", async () => {
    m.script = [["table_name = 'transactions'", [{ exists: false }]]]
    const result = await testDatabaseConnection(URL, ADMIN)
    expect(result).toEqual({
      ok: true,
      hasData: false,
      lookupEmail: "Dono@Example.com",
      owner: null,
      knownEmails: [],
      audit: null,
      schemaCheck: { ok: true, missingColumns: [] },
    })
    expect(m.queries.some((q) => q.includes("information_schema.columns"))).toBe(false)
  })

  it("tabela financeira com outro formato NÃO esconde a falta de coluna em users (estrutura vem antes da auditoria)", async () => {
    scriptWithData(REQUIRED_USERS_COLUMNS.filter((c) => c !== "google_token_expires_at"))
    m.script = m.script.map(([f, rows]) => (f === "FROM accounts" ? [f, Object.assign(new Error("column does not exist"), { code: "42703" })] : [f, rows]))
    const result = await testDatabaseConnection(URL, ADMIN)
    expect(result).toEqual({
      ok: true,
      hasData: true,
      lookupEmail: "Dono@Example.com",
      owner: { id: "u-dono", email: "dono@example.com" },
      knownEmails: [],
      audit: null,
      schemaCheck: { ok: false, missingColumns: ["google_token_expires_at"] },
    })
    expect(m.queries.some((q) => q.includes("information_schema.columns"))).toBe(true)
  })

  it("falha ao ler as colunas de users → erro de conexão (nunca 'compatível' sem ter lido)", async () => {
    scriptWithData(REQUIRED_USERS_COLUMNS)
    m.script = m.script.map(([f, rows]) => (f === "information_schema.columns" ? [f, new Error("permission denied")] : [f, rows]))
    const result = await testDatabaseConnection(URL, ADMIN)
    expect(result).toMatchObject({ ok: false, code: "unknown" })
  })

  it("falha de conexão → código estável, nada de audit", async () => {
    m.connectError = Object.assign(new Error("password authentication failed"), { code: "28P01" })
    const result = await testDatabaseConnection(URL, ADMIN)
    expect(result).toMatchObject({ ok: false, code: "invalidPassword" })
  })
})

describe("readUsersColumns", () => {
  it("lê column_name de information_schema.columns da tabela users", async () => {
    const client = { query: async () => ({ rows: [{ column_name: "id" }, { column_name: "email" }] }) }
    expect(await readUsersColumns(client)).toEqual(["id", "email"])
  })
})
