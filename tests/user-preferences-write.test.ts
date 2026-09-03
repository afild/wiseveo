import { describe, expect, it } from "vitest"
import {
  bumpPinFailure, mergeUserPreferenceKey, setUserPreferenceKey, writeUserPreferenceKeys,
  type PreferencesExecutor,
} from "@/features/settings/services/user-preferences-write"

import { sqlText } from "./security/helpers/sql-text"

function fakeExecutor(columnType: "json" | "jsonb", bumpRow = { count: 1, locked_until: null as string | null }) {
  const calls: Array<{ sql: string; values: unknown[] }> = []
  const executor = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = sqlText(strings, values)
      calls.push({ sql, values })
      if (sql.includes("information_schema.columns")) return [{ data_type: columnType }]
      return [bumpRow]
    },
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ sql: sqlText(strings, values), values })
      return 1
    },
  } as unknown as PreferencesExecutor
  return { executor, calls }
}

describe("mergeUserPreferenceKey", () => {
  it("mescla só a chave pedida e protege o lado existente com jsonb_typeof", async () => {
    const { executor, calls } = fakeExecutor("jsonb")
    await mergeUserPreferenceKey(executor, "u1", "dateClosing", { closedThrough: "2026-08-31" })
    const update = calls.find((c) => c.sql.startsWith("\n    UPDATE users") || c.sql.includes("UPDATE users"))!
    expect(update.sql).toContain("jsonb_typeof")
    expect(update.sql).toContain("jsonb_build_object")
    expect(update.values).toContain("dateClosing")
    expect(update.values).toContain(JSON.stringify({ closedThrough: "2026-08-31" }))
    expect(update.values).toContain("u1")
  })
  it("sonda o tipo da coluna pelo MESMO executor e converte de volta para json quando a coluna é json", async () => {
    const { executor, calls } = fakeExecutor("json")
    await mergeUserPreferenceKey(executor, "u1", "dateClosing", { pinHash: "h" })
    expect(calls[0].sql).toContain("information_schema.columns")
    expect(calls[1].sql).toContain("::json\n")
  })
  it("cacheia a sonda por executor", async () => {
    const { executor, calls } = fakeExecutor("jsonb")
    await mergeUserPreferenceKey(executor, "u1", "dateClosing", { a: 1 })
    await mergeUserPreferenceKey(executor, "u1", "dateClosing", { b: 2 })
    expect(calls.filter((c) => c.sql.includes("information_schema")).length).toBe(1)
  })
})

describe("setUserPreferenceKey e writeUserPreferenceKeys", () => {
  it("set troca o valor inteiro da chave via jsonb_set (escalar e array não viram array concatenado)", async () => {
    const { executor, calls } = fakeExecutor("jsonb")
    await setUserPreferenceKey(executor, "u1", "locale", "pt-BR")
    expect(calls[1].sql).toContain("jsonb_set")
    expect(calls[1].values).toContain(JSON.stringify("pt-BR"))
    await setUserPreferenceKey(executor, "u1", "budgetOrder", ["a", "b"])
    expect(calls[2].values).toContain(JSON.stringify(["a", "b"]))
  })
  it("várias chaves saem num único UPDATE", async () => {
    const { executor, calls } = fakeExecutor("jsonb")
    await writeUserPreferenceKeys(executor, "u1", [{ key: "budgetFormula", value: { x: 1 } }, { key: "budgetOrder", value: [] }])
    const updates = calls.filter((c) => c.sql.includes("UPDATE users"))
    expect(updates.length).toBe(1)
    expect(updates[0].values).toContain(JSON.stringify({ budgetFormula: { x: 1 }, budgetOrder: [] }))
  })
})

describe("bumpPinFailure", () => {
  it("incrementa no banco numa única instrução com RETURNING e devolve o contador", async () => {
    const { executor, calls } = fakeExecutor("jsonb", { count: 5, locked_until: "2026-09-02T12:00:00.000Z" })
    const result = await bumpPinFailure(executor, "u1", 5, 15)
    const stmt = calls.find((c) => c.sql.includes("RETURNING"))!
    expect(stmt.sql).toContain("FOR UPDATE")
    expect(stmt.sql).toContain("+ 1")
    expect(stmt.sql).toContain("jsonb_typeof(calc.p -> 'dateClosing')")
    expect(result).toEqual({ count: 5, lockedUntil: "2026-09-02T12:00:00.000Z" })
  })
})
