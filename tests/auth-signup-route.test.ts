import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Cadastro por e-mail numa instalação JÁ configurada (com banco e cadastro público).
 * Regressão corrigida em 2026-08-22: a rota chamava `initializeUserData(newUser.id)`
 * com 1 argumento (assinatura é `(client, userId, prefix?)`), então o usuário era
 * gravado e o plano de contas padrão explodia depois → "erro interno" e, na
 * segunda tentativa, "e-mail já cadastrado".
 */
const m = vi.hoisted(() => {
  const prisma = {
    user: { create: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
  }
  type InitializeUserData = (client: unknown, userId: string, prefix?: string) => Promise<Record<string, number>>
  return { prisma, initializeUserData: vi.fn<InitializeUserData>() }
})

vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }))
vi.mock("@/lib/user-init", () => ({
  initializeUserData: (...args: Parameters<typeof m.initializeUserData>) => m.initializeUserData(...args),
}))
vi.mock("@/generated/prisma_new/client", () => ({
  Prisma: { PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error { code = "" } },
}))
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }))
vi.mock("@/lib/setup-check", () => ({ isSetupComplete: () => true }))
vi.mock("@/lib/public-signup", () => ({ isPublicSignupEnabled: () => true }))
vi.mock("@/lib/auth", () => ({ createSessionToken: async () => "session-token", COOKIE_NAME: "wiseveo-session" }))
vi.mock("bcryptjs", () => ({ default: { hash: async () => "hashed-password" } }))

import { POST } from "@/app/api/auth/signup/route"
import { PENDING_APPROVAL_PATH } from "@/lib/user-approval"

function signup(body: Record<string, unknown>) {
  return POST(
    new Request("http://localhost:3000/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  )
}

describe("POST /api/auth/signup (instalação configurada)", () => {
  beforeEach(() => {
    m.prisma.user.create.mockReset()
    m.prisma.user.count.mockReset()
    m.prisma.user.findUnique.mockReset()
    m.initializeUserData.mockReset()
    m.initializeUserData.mockResolvedValue({})
    m.prisma.user.findUnique.mockResolvedValue(null)
  })

  it("cria o usuário PENDENTE e inicializa o plano de contas com o cliente do banco (2 argumentos)", async () => {
    m.prisma.user.count.mockResolvedValue(1)
    m.prisma.user.create.mockResolvedValue({ id: "user-new", status: "PENDING" })

    const res = await signup({ name: "Ana", email: "Ana@Example.com", password: "12345678" })
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json).toMatchObject({ success: true, redirectTo: PENDING_APPROVAL_PATH })
    expect(m.prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: "ana@example.com", role: "USER", status: "PENDING" }),
    })
    expect(m.initializeUserData).toHaveBeenCalledTimes(1)
    const [client, userId, prefix] = m.initializeUserData.mock.calls[0]
    expect(client).toBe(m.prisma)
    expect(userId).toBe("user-new")
    expect(prefix).toBeUndefined()
    expect(res.headers.get("set-cookie")).toBeNull()
  })

  it("primeiro usuário do banco nasce SUPERADMIN ativo, com sessão e plano de contas", async () => {
    m.prisma.user.count.mockResolvedValue(0)
    m.prisma.user.create.mockResolvedValue({ id: "user-1", status: "ACTIVE" })

    const res = await signup({ name: "Dono", email: "dono@example.com", password: "12345678" })

    expect(res.status).toBe(201)
    expect(m.prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ role: "SUPERADMIN", status: "ACTIVE" }),
    })
    expect(m.initializeUserData).toHaveBeenCalledWith(m.prisma, "user-1")
    expect(res.headers.get("set-cookie")).toContain("wiseveo-session=session-token")
  })

  it("falha na inicialização do plano de contas vira 500 sem abrir sessão", async () => {
    m.prisma.user.count.mockResolvedValue(0)
    m.prisma.user.create.mockResolvedValue({ id: "user-1", status: "ACTIVE" })
    m.initializeUserData.mockRejectedValue(new TypeError("tx.transactionStatusLookup is undefined"))

    const res = await signup({ name: "Dono", email: "dono@example.com", password: "12345678" })

    expect(res.status).toBe(500)
    expect(res.headers.get("set-cookie")).toBeNull()
  })
})
