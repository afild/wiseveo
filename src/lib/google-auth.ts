import { randomBytes } from "crypto"
import { getAppUrl } from "@/lib/app-url"

/**
 * Login = só identidade (openid/email/profile): escopos não sensíveis, publicáveis
 * sem verificação do Google e sem expiração de 7 dias em app "em teste". A Agenda
 * (escopo sensível) é pedida APENAS ao conectar o calendário — ver
 * getGoogleCalendarAuthUrl / api/calendar/connect-google.
 */
export const GOOGLE_LOGIN_SCOPES = ["openid", "email", "profile"] as const
export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events"
const LOGIN_SCOPE = GOOGLE_LOGIN_SCOPES.join(" ")

/**
 * `appUrl` = endereço público desta instalação (getAppUrl(request)); o
 * redirect_uri precisa ser IGUAL na ida (getGoogleAuthUrl) e na volta
 * (exchangeCodeForTokens), então as rotas passam a mesma origem nos dois.
 */
function getConfig(appUrl?: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID || ""
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || ""
  const base = appUrl || getAppUrl()
  const redirectUri = `${base}/api/auth/google/callback`
  return { clientId, clientSecret, redirectUri }
}

/** Cookie curto que carrega o token de convite pelo fluxo OAuth (aceite via Google). */
export const GOOGLE_INVITE_COOKIE = "google_oauth_invite"

export function isGoogleConfigured(): boolean {
  const { clientId, clientSecret } = getConfig()
  return !!(clientId && clientSecret)
}

export function generateState(): string {
  return randomBytes(32).toString("hex")
}

export function getGoogleAuthUrl(state: string, appUrl?: string): string {
  const { clientId, redirectUri } = getConfig(appUrl)
  // Sem access_type=offline (nenhum refresh token é guardado no login) e sem
  // prompt=consent (o Google só mostra a permissão na primeira vez; depois
  // apenas a escolha da conta).
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: LOGIN_SCOPE,
    prompt: "select_account",
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

interface GoogleTokens {
  access_token: string
  id_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

export async function exchangeCodeForTokens(code: string, appUrl?: string): Promise<GoogleTokens> {
  const { clientId, clientSecret, redirectUri } = getConfig(appUrl)
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Google token exchange failed: ${error}`) // i18n-ignore: mensagem interna de Error (inclui payload cru da API do Google), nunca exibida ao usuário
  }

  return res.json()
}

interface GoogleUserInfo {
  sub: string
  email: string
  name: string
  picture?: string
  given_name?: string
  family_name?: string
}

export function decodeIdToken(idToken: string): GoogleUserInfo {
  const payload = idToken.split(".")[1]
  const decoded = Buffer.from(payload, "base64url").toString("utf-8")
  return JSON.parse(decoded)
}

/**
 * Generates a Google OAuth URL for calendar-only connection.
 * Used when user logged in via email/password but wants to connect Google Calendar.
 */
export function getGoogleCalendarAuthUrl(state: string, appUrl?: string): string {
  const { clientId } = getConfig()
  const redirectUri = `${appUrl || getAppUrl()}/api/calendar/connect-google/callback`
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

/**
 * Exchange authorization code for tokens using the calendar-specific redirect URI.
 */
export async function exchangeCalendarCodeForTokens(
  code: string,
  appUrl?: string,
): Promise<GoogleTokens> {
  const { clientId, clientSecret } = getConfig()
  const redirectUri = `${appUrl || getAppUrl()}/api/calendar/connect-google/callback`
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Google calendar token exchange failed: ${error}`) // i18n-ignore: mensagem interna de Error (inclui payload cru da API do Google), nunca exibida ao usuário
  }

  return res.json()
}

/**
 * Refresh an expired access token using a refresh token.
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ access_token: string; expires_in: number }> {
  const { clientId, clientSecret } = getConfig()
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Google token refresh failed: ${error}`) // i18n-ignore: mensagem interna de Error (inclui payload cru da API do Google), nunca exibida ao usuário
  }

  return res.json()
}

/**
 * Returns a valid access token for a user, refreshing if necessary.
 * Returns null if the user has no Google Calendar connection.
 */
export async function getValidAccessToken(
  userId: string,
): Promise<string | null> {
  const { prisma } = await import("@/lib/prisma")

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      googleAccessToken: true,
      googleRefreshToken: true,
      googleTokenExpiresAt: true,
    },
  })

  if (!user?.googleRefreshToken) return null

  // If token is still valid (with 5-minute buffer)
  if (
    user.googleAccessToken &&
    user.googleTokenExpiresAt &&
    user.googleTokenExpiresAt > new Date(Date.now() + 5 * 60 * 1000)
  ) {
    return user.googleAccessToken
  }

  // Refresh. Se o Google responder invalid_grant (refresh token expirado — 7 dias
  // em app "em teste" — ou revogado), desconecta: limpa os tokens para a página
  // Calendário voltar a oferecer "Conectar Google Calendar". Antes o login com
  // Google renovava esse token por tabela; desde que o login pede só identidade,
  // este é o único caminho de recuperação.
  let refreshed: { access_token: string; expires_in: number }
  try {
    refreshed = await refreshAccessToken(user.googleRefreshToken)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes("invalid_grant")) {
      await prisma.user.update({
        where: { id: userId },
        data: { googleAccessToken: null, googleRefreshToken: null, googleTokenExpiresAt: null },
      })
      return null
    }
    throw err
  }
  const { access_token, expires_in } = refreshed
  await prisma.user.update({
    where: { id: userId },
    data: {
      googleAccessToken: access_token,
      googleTokenExpiresAt: new Date(Date.now() + expires_in * 1000),
    },
  })

  return access_token
}
