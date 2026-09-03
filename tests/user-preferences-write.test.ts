import { readFile } from "node:fs/promises"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  bumpPinFailure, mergeUserPreferenceKey, setUserPreferenceKey, writeUserPreferenceKeys,
  type PreferencesExecutor,
} from "@/features/settings/services/user-preferences-write"

import { assertPlainStatement, unsafeSqlText } from "./security/helpers/sql-text"

type FakeRow = { count: number; locked_until: string | null; prev_type: string | null }
const OK_ROW: FakeRow = { count: 1, locked_until: null, prev_type: "object" }

function fakeExecutor(columnType: "json" | "jsonb", row: FakeRow = OK_ROW) {
  const calls: Array<{ sql: string; values: unknown[] }> = []
  const executor = {
    $queryRawUnsafe: async (query: string, ...values: unknown[]) => {
      assertPlainStatement(query, values)
      calls.push({ sql: unsafeSqlText(query, values), values })
      if (query.includes("information_schema.columns")) return [{ data_type: columnType }]
      return [row]
    },
  } as unknown as PreferencesExecutor
  return { executor, calls }
}

/** Executor que nunca acha a linha: o RETURNING das QUATRO volta vazio. */
function deadExecutor() {
  return {
    $queryRawUnsafe: async (query: string, ...values: unknown[]) => {
      assertPlainStatement(query, values)
      return query.includes("information_schema.columns") ? [{ data_type: "jsonb" }] : []
    },
  } as unknown as PreferencesExecutor
}

/** A raiz normalizada para objeto: o mesmo texto tem de aparecer nas QUATRO instruções. */
const ROOT_GUARD =
  "CASE WHEN jsonb_typeof(users.preferences_json::jsonb) = 'object' THEN users.preferences_json::jsonb ELSE '{}'::jsonb END"

/** Os valores chegam JÁ simples (o executor falso reprova qualquer fragmento aninhado). */
function flatValues(values: unknown[]): unknown[] {
  assertPlainStatement("", values)
  return values
}

const isBump = (sql: string) => sql.includes("FOR UPDATE")

async function allFourStatements() {
  const { executor, calls } = fakeExecutor("jsonb")
  await mergeUserPreferenceKey(executor, "u1", "dateClosing", { a: 1 })
  await setUserPreferenceKey(executor, "u1", "locale", "pt-BR")
  await writeUserPreferenceKeys(executor, "u1", [{ key: "a", value: 1 }])
  await bumpPinFailure(executor, "u1", 5, 15)
  return calls.filter((c) => !c.sql.includes("information_schema"))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("mergeUserPreferenceKey", () => {
  it("mescla só a chave pedida e protege o lado existente com jsonb_typeof", async () => {
    const { executor, calls } = fakeExecutor("jsonb")
    await mergeUserPreferenceKey(executor, "u1", "dateClosing", { closedThrough: "2026-08-31" })
    const update = calls.find((c) => c.sql.includes("UPDATE users"))!
    expect(update.sql).toContain("jsonb_typeof")
    expect(update.sql).toContain("jsonb_build_object")
    expect(flatValues(update.values)).toContain("dateClosing")
    expect(flatValues(update.values)).toContain(JSON.stringify({ closedThrough: "2026-08-31" }))
    expect(flatValues(update.values)).toContain("u1")
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
    expect(flatValues(calls[1].values)).toContain(JSON.stringify("pt-BR"))
    await setUserPreferenceKey(executor, "u1", "budgetOrder", ["a", "b"])
    expect(flatValues(calls[2].values)).toContain(JSON.stringify(["a", "b"]))
  })
  it("várias chaves saem num único UPDATE", async () => {
    const { executor, calls } = fakeExecutor("jsonb")
    await writeUserPreferenceKeys(executor, "u1", [{ key: "budgetFormula", value: { x: 1 } }, { key: "budgetOrder", value: [] }])
    const updates = calls.filter((c) => c.sql.includes("UPDATE users"))
    expect(updates.length).toBe(1)
    expect(flatValues(updates[0].values)).toContain(JSON.stringify({ budgetFormula: { x: 1 }, budgetOrder: [] }))
  })
})

describe("bumpPinFailure", () => {
  it("incrementa no banco numa única instrução com RETURNING e devolve o contador", async () => {
    const { executor, calls } = fakeExecutor("jsonb", { count: 5, locked_until: "2026-09-02T12:00:00.000Z", prev_type: "object" })
    const result = await bumpPinFailure(executor, "u1", 5, 15)
    const stmt = calls.find((c) => isBump(c.sql))!
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
    const bump = stmts.find((c) => isBump(c.sql))!
    expect(bump.sql).toContain("jsonb_typeof(calc.p -> 'dateClosing')")
    expect(bump.sql).toContain(`SELECT id, preferences_json AS prev, (${ROOT_GUARD}) AS p`)
  })
})

describe("bumpPinFailure: contador à prova de valor inválido", () => {
  it("só converte o contador quando o valor guardado é mesmo um número JSON", async () => {
    const { executor, calls } = fakeExecutor("jsonb")
    await bumpPinFailure(executor, "u1", 5, 15)
    const stmt = calls.find((c) => isBump(c.sql))!
    expect(stmt.sql).toContain("jsonb_typeof(p -> 'dateClosing' -> 'pinFailures' -> 'count') = 'number'")
    expect(stmt.sql).toContain("::numeric")
    expect(stmt.sql).not.toContain("COALESCE((p -> 'dateClosing' -> 'pinFailures' ->> 'count')::int, 0)")
  })
  it("decimal e número gigante não abortam a instrução (trunc + limite antes do ::int)", async () => {
    const { executor, calls } = fakeExecutor("jsonb")
    await bumpPinFailure(executor, "u1", 5, 15)
    const stmt = calls.find((c) => isBump(c.sql))!
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
    expect(flatValues(calls[1].values)).toContain("null")
    expect(flatValues(calls[1].values)).not.toContain(undefined)
  })
  it("writeUserPreferenceKeys não deixa mais a chave SUMIR do JSON: função/símbolo viram null", async () => {
    const { executor, calls } = fakeExecutor("jsonb")
    await writeUserPreferenceKeys(executor, "u1", [
      { key: "callback", value: () => 1 },
      { key: "flag", value: undefined },
      { key: "ok", value: 2 },
    ])
    expect(flatValues(calls[1].values)).toContain(JSON.stringify({ callback: null, flag: null, ok: 2 }))
  })
  it("campo interno não serializável do patch do merge também vira null", async () => {
    const { executor, calls } = fakeExecutor("jsonb")
    await mergeUserPreferenceKey(executor, "u1", "dateClosing", { pinHash: undefined, closedThrough: "2026-08-31" })
    expect(flatValues(calls[1].values)).toContain(JSON.stringify({ pinHash: null, closedThrough: "2026-08-31" }))
  })
})

describe("patch do merge protegido dos dois lados", () => {
  it("recusa patch que não é objeto simples antes de tocar no banco", async () => {
    const { executor, calls } = fakeExecutor("jsonb")
    for (const bad of [[1, 2], null, "x", 7]) {
      await expect(mergeUserPreferenceKey(executor, "u1", "dateClosing", bad as unknown as Record<string, unknown>))
        .rejects.toThrow("preferences patch must be an object for u1")
    }
    expect(calls.length).toBe(0)
  })
  it("o PARÂMETRO do patch entra no || já normalizado para objeto", async () => {
    const { executor, calls } = fakeExecutor("jsonb")
    await mergeUserPreferenceKey(executor, "u1", "dateClosing", { a: 1 })
    const update = calls.find((c) => c.sql.includes("UPDATE users"))!
    expect(update.sql).toContain(`CASE WHEN jsonb_typeof({"a":1}::jsonb) = 'object' THEN {"a":1}::jsonb ELSE '{}'::jsonb END`)
  })
  it("writeUserPreferenceKeys também normaliza o parâmetro do ||", async () => {
    const { executor, calls } = fakeExecutor("jsonb")
    await writeUserPreferenceKeys(executor, "u1", [{ key: "a", value: 1 }])
    const update = calls.find((c) => c.sql.includes("UPDATE users"))!
    expect(update.sql).toContain(`CASE WHEN jsonb_typeof({"a":1}::jsonb) = 'object' THEN {"a":1}::jsonb ELSE '{}'::jsonb END`)
  })
})

describe("raiz corrompida deixa rastro", () => {
  it("as QUATRO leem o tipo da raiz ANTES da escrita, na mesma instrução", async () => {
    const stmts = await allFourStatements()
    for (const stmt of stmts) expect(stmt.sql).toContain("AS prev_type")
    for (const stmt of stmts.filter((s) => !isBump(s.sql))) {
      expect(stmt.sql).toContain("FROM (SELECT id, preferences_json AS prev FROM users WHERE id = u1) src")
    }
  })
  it("avisa nomeando a função e o usuário quando a raiz não era objeto", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { executor } = fakeExecutor("jsonb", { count: 1, locked_until: null, prev_type: "array" })
    await setUserPreferenceKey(executor, "u1", "locale", "pt-BR")
    expect(warn).toHaveBeenCalledTimes(1)
    const msg = String(warn.mock.calls[0]?.[0])
    expect(msg).toContain("setUserPreferenceKey")
    expect(msg).toContain("u1")
    expect(msg).toContain("array")
  })
  it("não avisa quando a raiz era objeto nem quando era NULL do SQL", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    for (const prevType of ["object", null]) {
      const { executor } = fakeExecutor("jsonb", { count: 1, locked_until: null, prev_type: prevType })
      await setUserPreferenceKey(executor, "u1", "locale", "pt-BR")
      await bumpPinFailure(executor, "u1", 5, 15)
    }
    expect(warn).not.toHaveBeenCalled()
  })
})

/**
 * O bug que fechou este capítulo só aparecia DENTRO do Next: fragmento `Prisma.sql`/`Prisma.raw`
 * aninhado num `${}` só entra no texto do SQL se passar num `instanceof` contra a classe da cópia
 * do cliente Prisma que montou o template, e o Next carrega o módulo gerado mais de uma vez (a
 * camada dos Server Components e a das rotas são bundles separados). Quando as cópias não batem,
 * o fragmento vira PARÂMETRO: o banco recebia `)$9` e recusava com `syntax error at or near "$9"`.
 * Nem o teste de unidade nem o de PGlite viam isso, porque nos dois só existe uma cópia do módulo.
 * A defesa é não depender de emenda de fragmento: texto fixo + `$n`, valores no array.
 */
describe("transporte: texto puro e parâmetros, nunca fragmento aninhado", () => {
  it("as QUATRO mandam a instrução como string e os valores como escalares", async () => {
    const seen: Array<{ query: unknown; values: unknown[] }> = []
    const executor = {
      $queryRawUnsafe: async (query: string, ...values: unknown[]) => {
        seen.push({ query, values })
        return query.includes("information_schema.columns") ? [{ data_type: "jsonb" }] : [OK_ROW]
      },
    } as unknown as PreferencesExecutor
    await mergeUserPreferenceKey(executor, "u1", "dateClosing", { a: 1 })
    await setUserPreferenceKey(executor, "u1", "locale", "pt-BR")
    await writeUserPreferenceKeys(executor, "u1", [{ key: "a", value: 1 }])
    await bumpPinFailure(executor, "u1", 5, 15)
    expect(seen.length).toBe(5) // a sonda da coluna + as quatro escritas
    for (const { query, values } of seen) {
      expect(typeof query).toBe("string")
      // `strings`/`values` é a forma de um Prisma.sql: nenhum valor pode ter isso.
      for (const value of values) expect(["string", "number", "boolean"]).toContain(typeof value)
    }
  })
  it("o módulo publicado não usa mais template marcado nem Prisma.sql/Prisma.raw", async () => {
    const body = await readFile("src/features/settings/services/user-preferences-write.ts", "utf8")
    const code = body.replace(/^\s*\*.*$/gm, "") // tira as linhas de comentário (elas explicam o bug)
    expect(code).not.toMatch(/Prisma\.(sql|raw|join|empty)\b/)
    expect(code).not.toMatch(/\$(query|execute)Raw\s*</) // `$queryRaw<T>` marcado
    expect(code).not.toMatch(/\$(query|execute)Raw\s*`/) // `$queryRaw` com crase
    expect(code).toContain("$queryRawUnsafe")
  })
})
