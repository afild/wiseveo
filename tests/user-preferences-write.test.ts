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

/** Executor que nunca acha a linha: UPDATE afeta 0 e o RETURNING volta vazio. */
function deadExecutor() {
  return {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) =>
      sqlText(strings, values).includes("information_schema.columns") ? [{ data_type: "jsonb" }] : [],
    $executeRaw: async () => 0,
  } as unknown as PreferencesExecutor
}

/** A raiz normalizada para objeto: o mesmo texto tem de aparecer nas QUATRO instruções. */
const ROOT_GUARD =
  "CASE WHEN jsonb_typeof(preferences_json::jsonb) = 'object' THEN preferences_json::jsonb ELSE '{}'::jsonb END"

async function allFourStatements() {
  const { executor, calls } = fakeExecutor("jsonb")
  await mergeUserPreferenceKey(executor, "u1", "dateClosing", { a: 1 })
  await setUserPreferenceKey(executor, "u1", "locale", "pt-BR")
  await writeUserPreferenceKeys(executor, "u1", [{ key: "a", value: 1 }])
  await bumpPinFailure(executor, "u1", 5, 15)
  return calls.filter((c) => !c.sql.includes("information_schema"))
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

describe("raiz de preferences_json protegida", () => {
  it("as QUATRO instruções normalizam a raiz para objeto antes de mexer nela", async () => {
    const stmts = await allFourStatements()
    expect(stmts.length).toBe(4)
    for (const stmt of stmts) expect(stmt.sql).toContain(ROOT_GUARD)
  })
  it("nenhuma instrução confia mais só no COALESCE da raiz (JSON null, escalar e array escapavam)", async () => {
    const stmts = await allFourStatements()
    for (const stmt of stmts) expect(stmt.sql).not.toContain("COALESCE(preferences_json")
  })
  it("bumpPinFailure também protege a chave dateClosing, não só a raiz", async () => {
    const stmts = await allFourStatements()
    const bump = stmts.find((c) => c.sql.includes("RETURNING"))!
    expect(bump.sql).toContain("jsonb_typeof(calc.p -> 'dateClosing')")
    expect(bump.sql).toContain(`SELECT id, (${ROOT_GUARD}) AS p`)
  })
})

describe("bumpPinFailure: contador à prova de valor inválido", () => {
  it("só converte o contador quando o valor guardado é mesmo um número JSON", async () => {
    const { executor, calls } = fakeExecutor("jsonb")
    await bumpPinFailure(executor, "u1", 5, 15)
    const stmt = calls.find((c) => c.sql.includes("RETURNING"))!
    expect(stmt.sql).toContain("jsonb_typeof(p -> 'dateClosing' -> 'pinFailures' -> 'count') = 'number'")
    expect(stmt.sql).toContain("::numeric")
    expect(stmt.sql).not.toContain("COALESCE((p -> 'dateClosing' -> 'pinFailures' ->> 'count')::int, 0)")
  })
  it("decimal e número gigante não abortam a instrução (trunc + limite antes do ::int)", async () => {
    const { executor, calls } = fakeExecutor("jsonb")
    await bumpPinFailure(executor, "u1", 5, 15)
    const stmt = calls.find((c) => c.sql.includes("RETURNING"))!
    expect(stmt.sql).toContain("LEAST(GREATEST(trunc(")
  })
})

describe("escrita falha alto quando a linha não existe", () => {
  it("as QUATRO lançam: bumpPinFailure não devolve mais 'zero falhas' silencioso", async () => {
    const executor = deadExecutor()
    await expect(mergeUserPreferenceKey(executor, "some", "dateClosing", { a: 1 }))
      .rejects.toThrow("preferences not written for some")
    await expect(setUserPreferenceKey(executor, "some", "locale", "pt-BR"))
      .rejects.toThrow("preferences not written for some")
    await expect(writeUserPreferenceKeys(executor, "some", [{ key: "a", value: 1 }]))
      .rejects.toThrow("preferences not written for some")
    await expect(bumpPinFailure(executor, "some", 5, 15))
      .rejects.toThrow("preferences not written for some")
  })
})

describe("serialização do valor", () => {
  it("valor que JSON.stringify não serializa vira null, nunca NULL de SQL (apagaria a coluna)", async () => {
    const { executor, calls } = fakeExecutor("jsonb")
    await setUserPreferenceKey(executor, "u1", "callback", () => 1)
    expect(calls[1].values).toContain("null")
    expect(calls[1].values).not.toContain(undefined)
  })
})
