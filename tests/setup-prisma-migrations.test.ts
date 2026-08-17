import { describe, expect, it } from "vitest"
import path from "path"
import {
  applyPrismaMigrations,
  checksumMigration,
  loadMigrationFiles,
  type MigrationFile,
  type MigrationQueryable,
} from "../src/features/setup/services/prisma-migrations.service"
import { detectSetupPersistence } from "../src/features/setup/services/setup-environment"

/**
 * Cliente falso: simula information_schema, a tabela _prisma_migrations e
 * grava tudo que foi executado, para checar ordem, transação e registros.
 */
function fakeClient(opts: { hasHistory: boolean; hasAppTables: boolean; rows?: Array<Record<string, unknown>>; failOn?: string }) {
  const executed: string[] = []
  const inserted: Array<{ id: string; checksum: string; name: string; finished: boolean }> = []
  let inTx = false
  const client: MigrationQueryable = {
    async query(text, values) {
      executed.push(text)
      if (text.startsWith("SELECT EXISTS")) {
        const table = String(values?.[0])
        const exists = table === "_prisma_migrations" ? opts.hasHistory : table === "transactions" ? opts.hasAppTables : false
        return { rows: [{ exists }] }
      }
      if (text.startsWith("CREATE TABLE IF NOT EXISTS")) return { rows: [] }
      if (text.startsWith("SELECT migration_name")) return { rows: opts.rows ?? [] }
      if (text === "BEGIN") {
        inTx = true
        return { rows: [] }
      }
      if (text === "COMMIT" || text === "ROLLBACK") {
        if (text === "ROLLBACK") inserted.splice(inserted.findIndex((r) => !r.finished), 1)
        inTx = false
        return { rows: [] }
      }
      if (text.startsWith('INSERT INTO "_prisma_migrations"')) {
        inserted.push({ id: String(values?.[0]), checksum: String(values?.[1]), name: String(values?.[2]), finished: false })
        return { rows: [] }
      }
      if (text.startsWith('UPDATE "_prisma_migrations"')) {
        const row = inserted.find((r) => r.id === values?.[0])
        if (row) row.finished = true
        return { rows: [] }
      }
      // SQL da migração
      if (opts.failOn && text.includes(opts.failOn)) throw new Error(`relation "x" already exists`)
      if (!inTx) throw new Error("migration ran outside a transaction")
      return { rows: [] }
    },
  }
  return { client, executed, inserted }
}

const files: MigrationFile[] = [
  { name: "20260301120857_init", sql: "CREATE TABLE a (id int);", checksum: checksumMigration("CREATE TABLE a (id int);") },
  { name: "20260302000000_second", sql: "ALTER TABLE a ADD b int;", checksum: checksumMigration("ALTER TABLE a ADD b int;") },
  { name: "20260303000000_third", sql: "CREATE INDEX i ON a (b);", checksum: checksumMigration("CREATE INDEX i ON a (b);") },
]

describe("loadMigrationFiles", () => {
  it("lê as migrações reais do projeto em ordem cronológica, com checksum sha256", () => {
    const real = loadMigrationFiles(path.join(process.cwd(), "prisma", "migrations"))
    expect(real.length).toBeGreaterThanOrEqual(1)
    expect(real[0].name).toMatch(/_init$/)
    expect(real.map((f) => f.name)).toEqual([...real.map((f) => f.name)].sort())
    expect(real[0].checksum).toMatch(/^[a-f0-9]{64}$/)
    expect(real[0].sql).toContain("CREATE TABLE")
  })

  it("pasta inexistente → lista vazia", () => {
    expect(loadMigrationFiles(path.join(process.cwd(), "nao", "existe"))).toEqual([])
  })
})

describe("applyPrismaMigrations", () => {
  it("banco novo: cria a tabela de histórico e aplica tudo em ordem, cada uma numa transação", async () => {
    const { client, executed, inserted } = fakeClient({ hasHistory: false, hasAppTables: false })
    const result = await applyPrismaMigrations(client, files)
    expect(result).toEqual({ ok: true, applied: files.map((f) => f.name), alreadyApplied: 0, skippedExistingSchema: false })
    expect(executed.some((q) => q.startsWith("CREATE TABLE IF NOT EXISTS"))).toBe(true)
    expect(inserted.map((r) => r.name)).toEqual(files.map((f) => f.name))
    expect(inserted.every((r) => r.finished)).toBe(true)
    expect(inserted[0].checksum).toBe(files[0].checksum)
    // BEGIN → INSERT → SQL → UPDATE → COMMIT por migração
    const firstBegin = executed.indexOf("BEGIN")
    expect(executed[firstBegin + 1]).toContain("INSERT INTO")
    expect(executed[firstBegin + 2]).toBe(files[0].sql)
    expect(executed[firstBegin + 3]).toContain("UPDATE")
    expect(executed[firstBegin + 4]).toBe("COMMIT")
  })

  it("histórico parcial (sem as tabelas do app ainda): pula as aplicadas e roda só as pendentes", async () => {
    const { client, inserted } = fakeClient({
      hasHistory: true,
      hasAppTables: false,
      rows: [
        { migration_name: files[0].name, finished_at: new Date(), rolled_back_at: null },
        { migration_name: files[1].name, finished_at: new Date(), rolled_back_at: null },
      ],
    })
    const result = await applyPrismaMigrations(client, files)
    expect(result).toEqual({ ok: true, applied: [files[2].name], alreadyApplied: 2, skippedExistingSchema: false })
    expect(inserted.map((r) => r.name)).toEqual([files[2].name])
  })

  it("banco que já tem o esquema do WISEVEO (db push, sem histórico) → pula tudo, sem tocar no banco", async () => {
    const { client, executed, inserted } = fakeClient({ hasHistory: false, hasAppTables: true })
    expect(await applyPrismaMigrations(client, files)).toEqual({
      ok: true,
      applied: [],
      alreadyApplied: 0,
      skippedExistingSchema: true,
    })
    expect(inserted).toEqual([])
    expect(executed.some((q) => q === "BEGIN" || q.startsWith("CREATE TABLE IF NOT EXISTS"))).toBe(false)
  })

  it("banco já migrado por completo (com histórico e tabelas) → também pula (idempotente)", async () => {
    const { client, inserted } = fakeClient({
      hasHistory: true,
      hasAppTables: true,
      rows: files.map((f) => ({ migration_name: f.name, finished_at: new Date(), rolled_back_at: null })),
    })
    expect(await applyPrismaMigrations(client, files)).toMatchObject({ ok: true, applied: [], skippedExistingSchema: true })
    expect(inserted).toEqual([])
  })

  it("erro numa migração: rollback, nada registrado, para na hora com o nome dela", async () => {
    const { client, inserted, executed } = fakeClient({ hasHistory: false, hasAppTables: false, failOn: "ALTER TABLE" })
    const result = await applyPrismaMigrations(client, files)
    expect(result).toEqual({
      ok: false,
      code: "migrationFailed",
      migration: files[1].name,
      detail: 'relation "x" already exists',
    })
    expect(executed).toContain("ROLLBACK")
    expect(inserted.map((r) => r.name)).toEqual([files[0].name]) // só a primeira ficou
    expect(executed.filter((q) => q === files[2].sql)).toHaveLength(0) // terceira nem tentou
  })

  it("tentativa anterior que não terminou → falha explícita (como o Prisma)", async () => {
    const { client } = fakeClient({
      hasHistory: true,
      hasAppTables: false,
      rows: [{ migration_name: files[0].name, finished_at: null, rolled_back_at: null }],
    })
    expect(await applyPrismaMigrations(client, files)).toEqual({
      ok: false,
      code: "migrationFailed",
      migration: files[0].name,
      detail: "previous attempt did not finish",
    })
  })
})

describe("detectSetupPersistence", () => {
  it("Vercel/Netlify/Lambda → manual-env; dev → auto-reload; produção gravável → restart-required", () => {
    expect(detectSetupPersistence({ VERCEL: "1", NODE_ENV: "production" }, process.cwd())).toBe("manual-env")
    expect(detectSetupPersistence({ NETLIFY: "true", NODE_ENV: "production" }, process.cwd())).toBe("manual-env")
    expect(detectSetupPersistence({ NODE_ENV: "development" }, process.cwd())).toBe("auto-reload")
    expect(detectSetupPersistence({ NODE_ENV: "production" }, process.cwd())).toBe("restart-required")
  })

  it("pasta não gravável → manual-env", () => {
    expect(detectSetupPersistence({ NODE_ENV: "production" }, path.join(process.cwd(), "nao", "existe"))).toBe("manual-env")
  })
})
