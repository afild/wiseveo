import { beforeEach, describe, expect, it, vi } from "vitest"
import { REQUIRED_USERS_COLUMNS } from "../src/features/setup/lib/schema-check"

/**
 * Finalizar do wizard num banco COM dados: ou ele na íntegra, ou nada.
 * Tudo dublado (pg, Prisma, migrações, cookies, i18n): o que se testa é a ORDEM das
 * guardas — nenhuma escrita antes de recusar — e que só o upsert do admin acontece.
 */
const m = vi.hoisted(() => ({
  migrations: { ok: true as const, applied: [] as string[], alreadyApplied: 0, skippedExistingSchema: true },
  columns: [] as string[],
  columnsError: null as Error | null,
  upsert: vi.fn<(args: { where: { email: string } }) => Promise<Record<string, never>>>(async () => ({})),
  findUnique: vi.fn(async () => null),
  initializeUserData: vi.fn(async () => ({})),
}))

vi.mock("pg", () => ({
  Client: class {
    async connect() {}
    async end() {}
    async query() {
      return { rows: [] }
    }
  },
  Pool: class {
    async end() {}
  },
}))
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: class {} }))
vi.mock("@/generated/prisma_new/client", () => ({
  PrismaClient: class {
    user = { findUnique: m.findUnique, upsert: m.upsert }
    async $disconnect() {}
  },
}))
vi.mock("@/lib/user-init", () => ({ initializeUserData: (...args: unknown[]) => m.initializeUserData(...(args as [])) }))
vi.mock("@/lib/setup-access", () => ({ canAccessSetup: async () => true }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("@/lib/setup-identity", () => ({
  SETUP_IDENTITY_COOKIE: "wiseveo-setup-identity",
  decodeSetupIdentity: async () => ({ name: "Dono", email: "dono@example.com", provider: "google", googleId: "g-1", photo: null }),
  clearSetupIdentityCookie: () => {},
}))
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))
vi.mock("@/features/setup/services/prisma-migrations.service", () => ({
  applyPrismaMigrations: async () => m.migrations,
  loadMigrationFiles: () => [],
}))
vi.mock("@/features/setup/services/setup-environment", () => ({
  detectSetupPersistence: () => "manual-env",
  detectHostingProvider: () => "vercel",
}))
vi.mock("@/features/setup/services/db-connection.service", () => ({
  readUsersColumns: async () => {
    if (m.columnsError) throw m.columnsError
    return m.columns
  },
}))
vi.mock("bcryptjs", () => ({ default: { hash: async () => "hash" } }))

import { POST } from "@/app/api/setup/configure/route"

function configure(body: Record<string, unknown>) {
  return POST(
    new Request("http://localhost:3000/api/setup/configure", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ databaseUrl: "postgresql://u:p@h:5432/db", locale: "pt-BR", integrations: {}, ...body }),
    }),
  )
}

describe("POST /api/setup/configure — banco com dados", () => {
  beforeEach(() => {
    m.migrations = { ok: true, applied: [], alreadyApplied: 0, skippedExistingSchema: true }
    m.columns = [...REQUIRED_USERS_COLUMNS]
    m.columnsError = null
    m.upsert.mockClear()
    m.findUnique.mockClear()
    m.initializeUserData.mockClear()
  })

  it("falha ao ler as colunas → erro próprio (não 'migração falhou') e nenhuma escrita", async () => {
    m.columnsError = new Error("permission denied for schema information_schema")
    const res = await configure({ useExistingData: true })
    const json = await res.json()
    expect(res.status).toBe(500)
    expect(json.code).toBe("unknown")
    expect(String(json.message)).not.toContain("migrationFailed")
    expect(m.upsert).not.toHaveBeenCalled()
  })

  it("recusa o modelo padrão sobre banco com dados, antes de qualquer escrita", async () => {
    const res = await configure({ useExistingData: false })
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json).toMatchObject({ success: false, code: "templateNotAllowedOnExistingData" })
    expect(m.upsert).not.toHaveBeenCalled()
    expect(m.initializeUserData).not.toHaveBeenCalled()
  })

  it("recusa quando falta coluna em users, citando a coluna, antes de qualquer escrita", async () => {
    m.columns = REQUIRED_USERS_COLUMNS.filter((c) => c !== "data_owner_id")
    const res = await configure({ useExistingData: true })
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.code).toBe("schemaIncompatible")
    expect(String(json.message)).toContain("data_owner_id")
    expect(m.upsert).not.toHaveBeenCalled()
  })

  it("banco na íntegra e estrutura ok → grava SÓ o administrador e devolve as variáveis", async () => {
    const res = await configure({ useExistingData: true })
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ success: true, mode: "manual-env" })
    expect(json.envVars.map((v: { key: string }) => v.key)).toEqual(
      expect.arrayContaining(["WISEVEO_SETUP_COMPLETE", "DATABASE_URL", "AUTH_SECRET"]),
    )
    expect(m.upsert).toHaveBeenCalledTimes(1)
    expect(m.upsert.mock.calls[0][0]).toMatchObject({ where: { email: "dono@example.com" } })
    expect(m.initializeUserData).not.toHaveBeenCalled()
  })
})

describe("POST /api/setup/configure — banco vazio (sem regressão)", () => {
  beforeEach(() => {
    m.migrations = { ok: true, applied: ["20260816000000_init"], alreadyApplied: 0, skippedExistingSchema: false }
    m.columns = []
    m.upsert.mockClear()
    m.initializeUserData.mockClear()
  })

  it("modelo padrão → cria o admin e inicializa o plano de contas", async () => {
    const res = await configure({ useExistingData: false })
    expect(res.status).toBe(200)
    expect(m.upsert).toHaveBeenCalledTimes(1)
    expect(m.initializeUserData).toHaveBeenCalledTimes(1)
  })
})
