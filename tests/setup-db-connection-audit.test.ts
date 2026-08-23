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
  connectError: null as Error | null,
}))

vi.mock("pg", () => {
  class Client {
    async connect() {
      if (m.connectError) throw m.connectError
    }
    async end() {}
    async query(text: string) {
      m.queries.push(text)
      const hit = m.script.find(([fragment]) => text.includes(fragment))
      if (hit && hit[1] instanceof Error) throw hit[1]
      return { rows: hit ? hit[1] : [] }
    }
  }
  return { Client }
})

import { readUsersColumns, testDatabaseConnection } from "../src/features/setup/services/db-connection.service"

const URL = "postgresql://postgres.ref:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
const columnRows = (cols: readonly string[]) => cols.map((column_name) => ({ column_name }))

function scriptWithData(users: readonly string[]) {
  m.script = [
    ["table_name = 'transactions'", [{ exists: true }]],
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
    m.connectError = null
  })

  it("banco com dados e colunas completas → hasData, audit com números e schemaCheck ok", async () => {
    scriptWithData(REQUIRED_USERS_COLUMNS)
    const result = await testDatabaseConnection(URL)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.hasData).toBe(true)
    expect(result.audit).toMatchObject({ accounts: 2, transactions: 14203, categories: 1, groups: 1 })
    expect(result.audit?.existingChart.groups[0]).toMatchObject({ name: "RECEITAS", categories: [{ code: "100.001" }] })
    expect(result.schemaCheck).toEqual({ ok: true, missingColumns: [] })
  })

  it("banco com dados sem data_owner_id → schemaCheck aponta a coluna (a conexão continua ok)", async () => {
    scriptWithData(REQUIRED_USERS_COLUMNS.filter((c) => c !== "data_owner_id"))
    const result = await testDatabaseConnection(URL)
    expect(result.ok && result.hasData).toBe(true)
    expect(result.ok && result.schemaCheck).toEqual({ ok: false, missingColumns: ["data_owner_id"] })
  })

  it("banco vazio → hasData=false, sem audit, schemaCheck ok e SEM consultar colunas", async () => {
    m.script = [["table_name = 'transactions'", [{ exists: false }]]]
    const result = await testDatabaseConnection(URL)
    expect(result).toEqual({ ok: true, hasData: false, audit: null, schemaCheck: { ok: true, missingColumns: [] } })
    expect(m.queries.some((q) => q.includes("information_schema.columns"))).toBe(false)
  })

  it("tabela financeira com outro formato NÃO esconde a falta de coluna em users (estrutura vem antes da auditoria)", async () => {
    scriptWithData(REQUIRED_USERS_COLUMNS.filter((c) => c !== "data_owner_id"))
    m.script = m.script.map(([f, rows]) => (f === "FROM accounts" ? [f, Object.assign(new Error("column does not exist"), { code: "42703" })] : [f, rows]))
    const result = await testDatabaseConnection(URL)
    expect(result).toEqual({ ok: true, hasData: true, audit: null, schemaCheck: { ok: false, missingColumns: ["data_owner_id"] } })
    expect(m.queries.some((q) => q.includes("information_schema.columns"))).toBe(true)
  })

  it("falha ao ler as colunas de users → erro de conexão (nunca 'compatível' sem ter lido)", async () => {
    scriptWithData(REQUIRED_USERS_COLUMNS)
    m.script = m.script.map(([f, rows]) => (f === "information_schema.columns" ? [f, new Error("permission denied")] : [f, rows]))
    const result = await testDatabaseConnection(URL)
    expect(result).toMatchObject({ ok: false, code: "unknown" })
  })

  it("falha de conexão → código estável, nada de audit", async () => {
    m.connectError = Object.assign(new Error("password authentication failed"), { code: "28P01" })
    const result = await testDatabaseConnection(URL)
    expect(result).toMatchObject({ ok: false, code: "invalidPassword" })
  })
})

describe("readUsersColumns", () => {
  it("lê column_name de information_schema.columns da tabela users", async () => {
    const client = { query: async () => ({ rows: [{ column_name: "id" }, { column_name: "email" }] }) }
    expect(await readUsersColumns(client)).toEqual(["id", "email"])
  })
})
