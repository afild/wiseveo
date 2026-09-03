import { beforeEach, describe, expect, it, vi } from "vitest"
import { jwtVerify } from "jose"
import { REQUIRED_USERS_COLUMNS } from "../src/features/setup/lib/schema-check"
import { deriveSessionKey, futureSessionSource } from "../src/lib/auth-secret"

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
  setPin: vi.fn(async () => {}),
  /** Cada `new PrismaClient()` da rota entra aqui: o PIN tem de ser gravado com ESSE cliente. */
  clients: [] as unknown[],
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
    constructor() {
      m.clients.push(this)
    }
    async $disconnect() {}
  },
}))
vi.mock("@/features/security/services/pin.service", () => ({
  PIN_RE: /^\d{4}$/,
  setPin: (...args: unknown[]) => m.setPin(...(args as [])),
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
    m.setPin.mockClear()
    m.clients.length = 0
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
    m.columns = REQUIRED_USERS_COLUMNS.filter((c) => c !== "google_token_expires_at")
    const res = await configure({ useExistingData: true })
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.code).toBe("schemaIncompatible")
    expect(String(json.message)).toContain("google_token_expires_at")
    expect(m.upsert).not.toHaveBeenCalled()
  })

  it("banco na íntegra e estrutura ok → grava SÓ o administrador e devolve as variáveis", async () => {
    const res = await configure({ useExistingData: true })
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ success: true, mode: "manual-env" })
    // Só o mínimo que a hospedagem precisa guardar: a chave de sessão é calculada da
    // URL do banco e o idioma viaja no cookie desta resposta.
    expect(json.envVars.map((v: { key: string }) => v.key)).toEqual(["WISEVEO_SETUP_COMPLETE", "DATABASE_URL"])
    expect(m.upsert).toHaveBeenCalledTimes(1)
    expect(m.upsert.mock.calls[0][0]).toMatchObject({ where: { email: "dono@example.com" } })
    expect(m.initializeUserData).not.toHaveBeenCalled()
  })

  it("devolve a sessão do administrador já assinada com a chave de DEPOIS do redeploy", async () => {
    const res = await configure({ useExistingData: true })
    const token = res.cookies.get("session")?.value
    expect(token).toBeTruthy()
    // Verifica com a chave que a instalação passará a usar (derivada da URL nova).
    const key = await deriveSessionKey(futureSessionSource("postgresql://u:p@h:5432/db", {} as NodeJS.ProcessEnv))
    const { payload } = await jwtVerify(token as string, key)
    expect(typeof payload.userId).toBe("string")
    // E o idioma escolhido no wizard acompanha quem instalou, sem virar variável.
    expect(res.cookies.get("NEXT_LOCALE")?.value).toBe("pt-BR")
  })
})

describe("POST /api/setup/configure — banco vazio (sem regressão)", () => {
  beforeEach(() => {
    m.migrations = { ok: true, applied: ["20260816000000_init"], alreadyApplied: 0, skippedExistingSchema: false }
    m.columns = []
    m.upsert.mockClear()
    m.initializeUserData.mockClear()
    m.setPin.mockClear()
    m.clients.length = 0
  })

  it("modelo padrão → cria o admin e inicializa o plano de contas", async () => {
    const res = await configure({ useExistingData: false })
    expect(res.status).toBe(200)
    expect(m.upsert).toHaveBeenCalledTimes(1)
    expect(m.initializeUserData).toHaveBeenCalledTimes(1)
  })
})

/**
 * Passo "Segurança" do wizard: o PIN é opcional e viaja em claro no Finalizar.
 * A rota valida ANTES de qualquer escrita e grava DEPOIS do administrador existir.
 * Pular (sem `security`, ou PIN vazio) não pode encostar em `preferences_json` —
 * numa reconfiguração isso apagaria o PIN de uma instalação que já roda.
 */
describe("POST /api/setup/configure — PIN de fechamento (passo Segurança)", () => {
  beforeEach(() => {
    m.migrations = { ok: true, applied: ["20260816000000_init"], alreadyApplied: 0, skippedExistingSchema: false }
    m.columns = []
    m.columnsError = null
    m.upsert.mockClear()
    m.findUnique.mockClear()
    m.initializeUserData.mockClear()
    m.setPin.mockClear()
    m.clients.length = 0
  })

  it("sem a chave `security` → nada é gravado em preferences_json", async () => {
    const res = await configure({ useExistingData: false })
    expect(res.status).toBe(200)
    expect(m.upsert).toHaveBeenCalledTimes(1)
    expect(m.setPin).not.toHaveBeenCalled()
  })

  it("PIN vazio (Pular) → nada é gravado, o PIN existente fica intacto", async () => {
    const res = await configure({ useExistingData: false, security: { pin: "   " } })
    expect(res.status).toBe(200)
    expect(m.setPin).not.toHaveBeenCalled()
  })

  it("reconfiguração de banco com dados, sem PIN novo → não encosta no PIN já gravado", async () => {
    m.migrations = { ok: true, applied: [], alreadyApplied: 0, skippedExistingSchema: true }
    m.columns = [...REQUIRED_USERS_COLUMNS]
    const res = await configure({ useExistingData: true, security: {} })
    expect(res.status).toBe(200)
    expect(m.upsert).toHaveBeenCalledTimes(1)
    expect(m.setPin).not.toHaveBeenCalled()
  })

  it("PIN fora de 4 dígitos → 400 antes de qualquer escrita", async () => {
    const res = await configure({ useExistingData: false, security: { pin: "12a4" } })
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json).toMatchObject({ success: false, code: "pinInvalid" })
    expect(m.upsert).not.toHaveBeenCalled()
    expect(m.initializeUserData).not.toHaveBeenCalled()
    expect(m.setPin).not.toHaveBeenCalled()
  })

  it("PIN curto → 400 e nenhuma escrita", async () => {
    const res = await configure({ useExistingData: false, security: { pin: "123" } })
    expect(res.status).toBe(400)
    expect(m.upsert).not.toHaveBeenCalled()
    expect(m.setPin).not.toHaveBeenCalled()
  })

  it("PIN válido → setPin com o cliente do Setup e o id do administrador, depois do upsert", async () => {
    const res = await configure({ useExistingData: false, security: { pin: " 4321 " } })
    expect(res.status).toBe(200)
    expect(m.setPin).toHaveBeenCalledTimes(1)
    const [executor, ownerId, pin] = m.setPin.mock.calls[0] as unknown as [unknown, string, string]
    // O executor é o cliente que o próprio Setup criou (a DATABASE_URL ainda não existe no processo).
    expect(executor).toBe(m.clients[0])
    expect(typeof ownerId).toBe("string")
    expect(ownerId.length).toBeGreaterThan(0)
    expect(pin).toBe("4321")
    // Ordem: o administrador existe antes de a preferência ser gravada.
    expect(m.upsert).toHaveBeenCalledTimes(1)
    expect(m.upsert.mock.invocationCallOrder[0]).toBeLessThan(m.setPin.mock.invocationCallOrder[0])
  })
})
