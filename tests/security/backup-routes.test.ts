import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

/**
 * As três portas do backup: a batida do despertador (segredo), o início do consentimento
 * (SUPERADMIN, fora da demo) e a volta do Google (propósito no state).
 */
const m = vi.hoisted(() => ({
  authorized: true,
  sessionUserId: "admin" as string | null,
  role: "SUPERADMIN",
  runs: [] as string[],
  updates: [] as Record<string, unknown>[],
  merged: [] as Array<{ key: string; patch: Record<string, unknown> }>,
  tokens: { access_token: "ya29.a", refresh_token: "1//r", expires_in: 3600, scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.file" },
}))

vi.mock("@/features/notifications/services/tick-secret.service", () => ({ isAuthorizedTick: async () => m.authorized }))
vi.mock("@/features/backup/services/run-backup.service", () => ({
  runBackup: async (input: { trigger: string }) => {
    m.runs.push(input.trigger)
    return { outcome: "skipped", reason: "notYet" }
  },
}))
vi.mock("@/lib/session", () => ({ getSessionUserId: async () => m.sessionUserId }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: async () => (m.sessionUserId ? { role: m.role, status: "ACTIVE" } : null),
      update: async (args: Record<string, unknown>) => {
        m.updates.push(args)
        return {}
      },
    },
  },
}))
vi.mock("@/features/settings/services/user-preferences-write", () => ({
  mergeUserPreferenceKey: async (_e: unknown, _u: string, key: string, patch: Record<string, unknown>) => {
    m.merged.push({ key, patch })
  },
}))
vi.mock("@/lib/google-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/google-auth")>()
  return { ...actual, isGoogleConfigured: () => true, exchangeCalendarCodeForTokens: async () => m.tokens }
})

import { GET as cronGet } from "@/app/api/cron/backup/route"
import { GET as connectGet } from "@/app/api/admin/backup/connect-google/route"
import { GET as callbackGet } from "@/app/api/calendar/connect-google/callback/route"

beforeEach(() => {
  m.authorized = true
  m.sessionUserId = "admin"
  m.role = "SUPERADMIN"
  m.runs = []
  m.updates = []
  m.merged = []
  delete process.env.NEXT_PUBLIC_DEMO_MODE
  vi.stubEnv("GOOGLE_CLIENT_ID", "cid")
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "sec")
  // `getAppUrl` lê NEXT_PUBLIC_APP_URL ANTES dos cabeçalhos e de `request.url`
  // (src/lib/app-url.ts:41): esta linha é quem fixa a origem esperada abaixo.
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.wiseveo.com")
})
afterEach(() => vi.unstubAllEnvs())

describe("GET /api/cron/backup", () => {
  it("na demo a rota não existe (404)", async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "true"
    const res = await cronGet(new NextRequest("http://localhost/api/cron/backup"))
    expect(res.status).toBe(404)
    expect(m.runs).toEqual([])
  })
  it("sem o segredo, 401 e nada roda", async () => {
    m.authorized = false
    const res = await cronGet(new NextRequest("http://localhost/api/cron/backup"))
    expect(res.status).toBe(401)
    expect(m.runs).toEqual([])
  })
  it("com o segredo, roda pelo despertador e devolve o resultado", async () => {
    const res = await cronGet(new NextRequest("http://localhost/api/cron/backup?key=x"))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, outcome: "skipped", reason: "notYet" })
    expect(m.runs).toEqual(["tick"])
  })
})

describe("GET /api/admin/backup/connect-google", () => {
  const req = () => new NextRequest("https://app.wiseveo.com/api/admin/backup/connect-google")

  it("na demo, 404; sem ser SUPERADMIN, 404", async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "true"
    expect((await connectGet(req())).status).toBe(404)
    delete process.env.NEXT_PUBLIC_DEMO_MODE
    m.role = "ADMIN"
    expect((await connectGet(req())).status).toBe(404)
  })

  it("SUPERADMIN: redireciona ao Google com drive.file incremental e grava o state com .backup no cookie da Agenda", async () => {
    const res = await connectGet(req())
    expect(res.status).toBe(307)
    const location = new URL(res.headers.get("location") ?? "")
    expect(location.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/drive.file")
    expect(location.searchParams.get("include_granted_scopes")).toBe("true")
    expect(location.searchParams.get("redirect_uri")).toBe("https://app.wiseveo.com/api/calendar/connect-google/callback")
    const state = location.searchParams.get("state") ?? ""
    expect(state.endsWith(".backup")).toBe(true)
    expect(res.headers.get("set-cookie")).toContain(`google_calendar_oauth_state=${state}`)
  })
})

describe("GET /api/calendar/connect-google/callback com propósito backup", () => {
  const back = (state: string, extra = "") =>
    callbackGet(
      new NextRequest(`https://app.wiseveo.com/api/calendar/connect-google/callback?code=c1&state=${state}${extra}`, {
        headers: { cookie: `google_calendar_oauth_state=${state}` },
      }),
    )

  it("grava os tokens cifrados, marca driveGrantedAt e volta para Configurações", async () => {
    const res = await back("abc.backup")
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("https://app.wiseveo.com/configuracoes?tab=integrations&backup=connected")
    expect(m.merged).toEqual([{ key: "backup", patch: { driveGrantedAt: expect.any(String) } }])
    const data = (m.updates[0] as { data: Record<string, string> }).data
    expect(data.googleAccessToken).not.toBe("ya29.a")
    expect(data.googleRefreshToken).not.toBe("1//r")
  })

  it("se o Google não devolveu o escopo do Drive, não marca driveGrantedAt e avisa", async () => {
    m.tokens = { ...m.tokens, scope: "https://www.googleapis.com/auth/calendar.events" }
    const res = await back("abc.backup")
    expect(res.headers.get("location")).toBe("https://app.wiseveo.com/configuracoes?tab=integrations&backup=scope_missing")
    expect(m.merged).toEqual([])
  })

  it("state errado com propósito backup volta para Configurações com o erro, não para o Calendário", async () => {
    const res = await callbackGet(
      new NextRequest("https://app.wiseveo.com/api/calendar/connect-google/callback?code=c1&state=abc.backup", {
        headers: { cookie: "google_calendar_oauth_state=outro.backup" },
      }),
    )
    expect(res.headers.get("location")).toBe("https://app.wiseveo.com/configuracoes?tab=integrations&backup=invalid_state")
  })

  it("propósito agenda continua igual: volta para /calendar e não toca em backup", async () => {
    const res = await back("abc")
    expect(res.headers.get("location")).toBe("https://app.wiseveo.com/calendar")
    expect(m.merged).toEqual([])
  })
})
