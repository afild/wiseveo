import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

/**
 * Retorno do Google (instalação configurada, usuário JÁ existente):
 *  - abre a sessão e, se houver idioma salvo no perfil, grava NEXT_LOCALE (T5);
 *  - vincula só identidade (googleId/foto) — NUNCA grava tokens da Agenda (T3);
 *  - usuário pendente de aprovação não ganha sessão nem cookie de idioma.
 */
const m = vi.hoisted(() => ({
  prisma: { user: { findFirst: vi.fn(), update: vi.fn() } },
}))

vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }))
vi.mock("@/lib/setup-check", () => ({ isSetupComplete: () => true }))
vi.mock("@/lib/public-signup", () => ({ isPublicSignupEnabled: () => false }))
vi.mock("@/lib/auth", () => ({ createSessionToken: async () => "session-token", COOKIE_NAME: "wiseveo-session" }))
vi.mock("@/lib/google-auth", () => ({
  isGoogleConfigured: () => true,
  exchangeCodeForTokens: async () => ({
    access_token: "ya29.access",
    id_token: "id-token",
    refresh_token: "1//refresh",
    expires_in: 3600,
    token_type: "Bearer",
  }),
  decodeIdToken: () => ({ sub: "google-sub", email: "Ana@Example.com", name: "Ana", picture: "https://p/ana.png" }),
}))

import { GET } from "@/app/api/auth/google/callback/route"
import { LOCALE_COOKIE_NAME } from "@/i18n/config"

function callback() {
  return GET(
    new NextRequest("https://app.wiseveo.com/api/auth/google/callback?code=abc&state=s1", {
      headers: { cookie: "google_oauth_state=s1" },
    }),
  )
}

const baseUser = {
  id: "user-1",
  email: "ana@example.com",
  name: "Ana",
  googleId: null,
  photo: null,
  status: "ACTIVE",
  role: "USER",
  googleRefreshToken: "old-calendar-refresh-token",
}

/** O usuário encontrado é o que `update` devolve (mesclado com os dados gravados). */
function arrange(user: Record<string, unknown>) {
  m.prisma.user.findFirst.mockResolvedValue(user)
  m.prisma.user.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...user, ...data }))
}

describe("GET /api/auth/google/callback — usuário existente", () => {
  beforeEach(() => {
    m.prisma.user.findFirst.mockReset()
    m.prisma.user.update.mockReset()
  })

  it("com locale es-419 salvo → sessão + NEXT_LOCALE=es-419, redirecionando ao dashboard", async () => {
    arrange({ ...baseUser, preferencesJson: { locale: "es-419" } })

    const res = await callback()
    const cookies = res.headers.getSetCookie()

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("https://app.wiseveo.com/dashboard")
    expect(cookies.some((c) => c.startsWith("wiseveo-session=session-token"))).toBe(true)
    const locale = cookies.find((c) => c.startsWith(`${LOCALE_COOKIE_NAME}=`))
    expect(locale).toContain(`${LOCALE_COOKIE_NAME}=es-419`)
    expect(locale).not.toMatch(/httponly/i)
  })

  it("sem preferência de idioma → só a sessão", async () => {
    arrange({ ...baseUser, preferencesJson: null })

    const res = await callback()
    const cookies = res.headers.getSetCookie()

    expect(res.status).toBe(307)
    expect(cookies.some((c) => c.startsWith("wiseveo-session="))).toBe(true)
    expect(cookies.some((c) => c.startsWith(`${LOCALE_COOKIE_NAME}=`))).toBe(false)
  })

  it("vincula só identidade: grava googleId/foto e NÃO toca nos tokens da Agenda", async () => {
    arrange({ ...baseUser, preferencesJson: null })

    await callback()

    expect(m.prisma.user.update).toHaveBeenCalledTimes(1)
    const { data } = m.prisma.user.update.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(data).toMatchObject({ googleId: "google-sub", photo: "https://p/ana.png" })
    expect(Object.keys(data)).not.toContain("googleAccessToken")
    expect(Object.keys(data)).not.toContain("googleRefreshToken")
    expect(Object.keys(data)).not.toContain("googleTokenExpiresAt")
  })

  it("usuário pendente de aprovação → vai para a tela de pendência, sem sessão nem idioma", async () => {
    arrange({ ...baseUser, status: "PENDING", preferencesJson: { locale: "pt-BR" } })

    const res = await callback()
    const cookies = res.headers.getSetCookie()

    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("https://app.wiseveo.com/cadastro-pendente")
    expect(cookies.some((c) => c.startsWith("wiseveo-session="))).toBe(false)
    expect(cookies.some((c) => c.startsWith(`${LOCALE_COOKIE_NAME}=`))).toBe(false)
  })
})
