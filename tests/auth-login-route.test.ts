import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

/**
 * Login por senha numa instalação configurada: além da sessão, a resposta deve
 * trazer o cookie de idioma quando a pessoa tem um idioma salvo no perfil
 * (preferencesJson.locale) — e NÃO trazer quando não tem.
 */
const m = vi.hoisted(() => ({
  prisma: { user: { findUnique: vi.fn() } },
  compare: vi.fn<(password: string, hash: string) => Promise<boolean>>(),
}))

vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }))
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }))
vi.mock("@/lib/setup-check", () => ({ isSetupComplete: () => true }))
vi.mock("@/lib/auth", () => ({ createSessionToken: async () => "session-token", COOKIE_NAME: "wiseveo-session" }))
vi.mock("bcryptjs", () => ({
  default: { compare: (...args: Parameters<typeof m.compare>) => m.compare(...args) },
}))

import { POST } from "@/app/api/auth/login/route"
import { LOCALE_COOKIE_NAME } from "@/i18n/config"

function login(body: Record<string, unknown>) {
  return POST(
    new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  )
}

const baseUser = { id: "user-1", email: "ana@example.com", passwordHash: "hash", status: "ACTIVE" }

describe("POST /api/auth/login — idioma salvo acompanha a pessoa", () => {
  beforeEach(() => {
    m.prisma.user.findUnique.mockReset()
    m.compare.mockReset()
    m.compare.mockResolvedValue(true)
  })

  it("usuário com locale pt-BR salvo → resposta abre sessão E grava NEXT_LOCALE=pt-BR", async () => {
    m.prisma.user.findUnique.mockResolvedValue({ ...baseUser, preferencesJson: { locale: "pt-BR" } })

    const res = await login({ email: "Ana@Example.com", password: "12345678" })
    const cookies = res.headers.getSetCookie()

    expect(res.status).toBe(200)
    expect(cookies.some((c) => c.startsWith("wiseveo-session=session-token"))).toBe(true)
    const locale = cookies.find((c) => c.startsWith(`${LOCALE_COOKIE_NAME}=`))
    expect(locale).toContain(`${LOCALE_COOKIE_NAME}=pt-BR`)
    expect(locale).not.toMatch(/httponly/i)
  })

  it("usuário sem preferência de idioma → só a sessão; NEXT_LOCALE não é tocado", async () => {
    m.prisma.user.findUnique.mockResolvedValue({ ...baseUser, preferencesJson: null })

    const res = await login({ email: "ana@example.com", password: "12345678" })
    const cookies = res.headers.getSetCookie()

    expect(res.status).toBe(200)
    expect(cookies.some((c) => c.startsWith("wiseveo-session="))).toBe(true)
    expect(cookies.some((c) => c.startsWith(`${LOCALE_COOKIE_NAME}=`))).toBe(false)
  })

  it("idioma inválido salvo no perfil é ignorado", async () => {
    m.prisma.user.findUnique.mockResolvedValue({ ...baseUser, preferencesJson: { locale: "xx" } })
    const res = await login({ email: "ana@example.com", password: "12345678" })
    expect(res.status).toBe(200)
    expect(res.headers.getSetCookie().some((c) => c.startsWith(`${LOCALE_COOKIE_NAME}=`))).toBe(false)
  })

  it("senha errada → 401 e nenhum cookie", async () => {
    m.prisma.user.findUnique.mockResolvedValue({ ...baseUser, preferencesJson: { locale: "pt-BR" } })
    m.compare.mockResolvedValue(false)
    const res = await login({ email: "ana@example.com", password: "errada" })
    expect(res.status).toBe(401)
    expect(res.headers.getSetCookie()).toEqual([])
  })
})
