import { randomBytes } from "crypto"

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ")

function getConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID || ""
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || ""
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  const redirectUri = `${appUrl}/api/auth/google/callback`
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

export function getGoogleAuthUrl(state: string): string {
  const { clientId, redirectUri } = getConfig()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
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

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const { clientId, clientSecret, redirectUri } = getConfig()
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
export function getGoogleCalendarAuthUrl(state: string): string {
  const { clientId } = getConfig()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  const redirectUri = `${appUrl}/api/calendar/connect-google/callback`
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.events",
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
): Promise<GoogleTokens> {
  const { clientId, clientSecret } = getConfig()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  const redirectUri = `${appUrl}/api/calendar/connect-google/callback`
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

  // Refresh
  const { access_token, expires_in } = await refreshAccessToken(
    user.googleRefreshToken,
  )
  await prisma.user.update({
    where: { id: userId },
    data: {
      googleAccessToken: access_token,
      googleTokenExpiresAt: new Date(Date.now() + expires_in * 1000),
    },
  })

  return access_token
}
