import { describe, expect, it } from "vitest"
import {
  GOOGLE_CALENDAR_SCOPE,
  GOOGLE_DRIVE_FILE_SCOPE,
  GOOGLE_LOGIN_SCOPES,
  getGoogleAuthUrl,
  getGoogleCalendarAuthUrl,
  getGoogleDriveAuthUrl,
} from "../src/lib/google-auth"
import { getGoogleRedirectUris } from "../src/lib/google-redirect-uris"

const APP_URL = "https://app.wiseveo.com"

function paramsOf(url: string) {
  const u = new URL(url)
  expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth")
  return u.searchParams
}

/**
 * Separação de escopos do Google:
 *   login  → só identidade (openid email profile) — não sensível, publicável sem
 *            verificação e sem expiração de 7 dias em app "em teste";
 *   agenda → calendar.events, pedido apenas ao conectar o calendário.
 */
describe("getGoogleAuthUrl (login)", () => {
  const p = paramsOf(getGoogleAuthUrl("state-123", APP_URL))

  it("pede exatamente openid email profile (lista literal, independente da constante)", () => {
    expect(p.get("scope")?.split(" ").sort()).toEqual(["email", "openid", "profile"])
    expect([...GOOGLE_LOGIN_SCOPES].sort()).toEqual(["email", "openid", "profile"])
  })

  it("não pede a Agenda nem nenhum escopo googleapis", () => {
    expect(p.get("scope")).not.toContain("calendar")
    expect(p.get("scope")).not.toContain("googleapis.com")
  })

  it("não pede acesso offline nem força consentimento a cada login", () => {
    expect(p.get("access_type")).toBeNull()
    expect(p.get("prompt")).toBe("select_account")
  })

  it("volta para /api/auth/google/callback da origem informada e carrega o state", () => {
    expect(p.get("redirect_uri")).toBe(`${APP_URL}/api/auth/google/callback`)
    expect(p.get("response_type")).toBe("code")
    expect(p.get("state")).toBe("state-123")
  })

  it("não pede o Drive nem soma escopos (o login continua só identidade)", () => {
    expect(p.get("scope")).not.toContain("drive")
    expect(p.get("include_granted_scopes")).toBeNull()
  })
})

describe("getGoogleCalendarAuthUrl (conectar Agenda)", () => {
  const p = paramsOf(getGoogleCalendarAuthUrl("state-456", APP_URL))

  it("pede calendar.events com acesso offline (refresh token) e consentimento", () => {
    expect(p.get("scope")).toBe(GOOGLE_CALENDAR_SCOPE)
    expect(GOOGLE_CALENDAR_SCOPE).toContain("calendar.events")
    expect(p.get("access_type")).toBe("offline")
    expect(p.get("prompt")).toBe("consent")
  })

  it("volta para /api/calendar/connect-google/callback da origem informada", () => {
    expect(p.get("redirect_uri")).toBe(`${APP_URL}/api/calendar/connect-google/callback`)
    expect(p.get("state")).toBe("state-456")
  })
})

describe("getGoogleDriveAuthUrl (conectar Drive para o backup)", () => {
  const p = paramsOf(getGoogleDriveAuthUrl("state-789.backup", APP_URL))

  it("pede só drive.file (arquivos que o app criar), nunca o Drive inteiro", () => {
    expect(p.get("scope")).toBe(GOOGLE_DRIVE_FILE_SCOPE)
    expect(GOOGLE_DRIVE_FILE_SCOPE).toBe("https://www.googleapis.com/auth/drive.file")
    expect(p.get("scope")).not.toContain("calendar")
  })

  it("é incremental: soma ao que a pessoa já concedeu, para a Agenda não cair", () => {
    expect(p.get("include_granted_scopes")).toBe("true")
    expect(p.get("access_type")).toBe("offline")
    expect(p.get("prompt")).toBe("consent")
  })

  it("volta pelo callback da Agenda, com o state inteiro", () => {
    expect(p.get("redirect_uri")).toBe(`${APP_URL}/api/calendar/connect-google/callback`)
    expect(p.get("state")).toBe("state-789.backup")
  })
})

describe("getGoogleRedirectUris (fonte única: fluxo OAuth e guia da tela de primeiro acesso)", () => {
  it("gera os dois endereços de retorno a partir da origem, com ou sem barra final", () => {
    expect(getGoogleRedirectUris(APP_URL)).toEqual({
      login: `${APP_URL}/api/auth/google/callback`,
      calendar: `${APP_URL}/api/calendar/connect-google/callback`,
    })
    expect(getGoogleRedirectUris(`${APP_URL}/`)).toEqual(getGoogleRedirectUris(APP_URL))
    expect(getGoogleRedirectUris("http://localhost:3000").login).toBe("http://localhost:3000/api/auth/google/callback")
  })

  it("é exatamente o redirect_uri que o login e o calendário mandam ao Google", () => {
    const uris = getGoogleRedirectUris(APP_URL)
    expect(paramsOf(getGoogleAuthUrl("s", APP_URL)).get("redirect_uri")).toBe(uris.login)
    expect(paramsOf(getGoogleCalendarAuthUrl("s", APP_URL)).get("redirect_uri")).toBe(uris.calendar)
    expect(paramsOf(getGoogleDriveAuthUrl("s", APP_URL)).get("redirect_uri")).toBe(uris.calendar)
  })
})
