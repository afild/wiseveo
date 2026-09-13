import { randomBytes } from "crypto"
import { getAppUrl } from "@/lib/app-url"
import { getGoogleRedirectUris } from "@/lib/google-redirect-uris"
import { encryptGoogleToken, isLegacyPlainToken, readGoogleToken } from "@/lib/google-token-cipher"

/**
 * Login = só identidade (openid/email/profile): escopos não sensíveis, publicáveis
 * sem verificação do Google e sem expiração de 7 dias em app "em teste". A Agenda
 * (escopo sensível) é pedida APENAS ao conectar o calendário — ver
 * getGoogleCalendarAuthUrl / api/calendar/connect-google.
 */
export const GOOGLE_LOGIN_SCOPES = ["openid", "email", "profile"] as const
export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events"
/** Só os arquivos que o próprio app criar. Nunca `drive` (o Drive inteiro). */
export const GOOGLE_DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file"
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
  const redirectUri = getGoogleRedirectUris(base).login
  return { clientId, clientSecret, redirectUri }
}

/** Cookie curto que carrega o token do convite pelo fluxo OAuth (aceite via Google). */
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
  /** Escopos cobertos pelo token, separados por espaço. Vem na resposta do Google. */
  scope?: string
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
  const redirectUri = getGoogleRedirectUris(appUrl || getAppUrl()).calendar
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
 * Consentimento do Google Drive para o backup. Volta pelo MESMO callback da Agenda
 * (sem endereço novo para cadastrar no Google Cloud) e é INCREMENTAL:
 * `include_granted_scopes=true` faz o token novo cobrir também o que a pessoa já tinha
 * concedido (a Agenda), porque existe um único conjunto de tokens por pessoa.
 */
export function getGoogleDriveAuthUrl(state: string, appUrl?: string): string {
  const { clientId } = getConfig()
  const redirectUri = getGoogleRedirectUris(appUrl || getAppUrl()).calendar
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_DRIVE_FILE_SCOPE,
    include_granted_scopes: "true",
    access_type: "offline",
    // select_account: o Google sempre pergunta a conta, senão "Trocar conta" reusaria em
    // silêncio a conta já logada no navegador (foi assim que a conta errada entrou em 13/09).
    prompt: "consent select_account",
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
  const redirectUri = getGoogleRedirectUris(appUrl || getAppUrl()).calendar
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

  // Os tokens são guardados cifrados; `readGoogleToken` também aceita os antigos, que
  // ficaram em claro no banco antes desta mudança.
  const refreshToken = readGoogleToken(user.googleRefreshToken)
  if (!refreshToken) {
    // O que está guardado não abre (senha do banco trocada, valor adulterado). Mesmo
    // desfecho de um token revogado: desconecta, e a página Calendário volta a
    // oferecer "Conectar". Insistir aqui só produziria erro do Google a cada acesso.
    await disconnectGoogleCalendar(userId)
    return null
  }
  const accessToken = readGoogleToken(user.googleAccessToken)

  // If token is still valid (with 5-minute buffer)
  if (
    accessToken &&
    user.googleTokenExpiresAt &&
    user.googleTokenExpiresAt > new Date(Date.now() + 5 * 60 * 1000)
  ) {
    return accessToken
  }

  // Refresh. Se o Google responder invalid_grant (refresh token expirado — 7 dias
  // em app "em teste" — ou revogado), desconecta: limpa os tokens para a página
  // Calendário voltar a oferecer "Conectar Google Calendar". Antes o login com
  // Google renovava esse token por tabela; desde que o login pede só identidade,
  // este é o único caminho de recuperação.
  let refreshed: { access_token: string; expires_in: number }
  try {
    refreshed = await refreshAccessToken(refreshToken)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // `unauthorized_client` = o token não vale mais para este app (visto em produção em
    // 11/09/2026 no token do Drive). Desfecho igual: sem desconectar, o cartão seguia
    // "conectado" e o backup falhava todo dia com internalError, sem botão para reconectar.
    if (message.includes("invalid_grant") || message.includes("unauthorized_client")) {
      await disconnectGoogleCalendar(userId)
      return null
    }
    throw err
  }
  const { access_token, expires_in } = refreshed
  await prisma.user.update({
    where: { id: userId },
    data: {
      googleAccessToken: encryptGoogleToken(access_token),
      googleTokenExpiresAt: new Date(Date.now() + expires_in * 1000),
      // Aproveita a renovação para trocar um refresh token legado (em claro) pelo
      // cifrado. Como o acesso vence a cada hora, o banco se limpa sozinho no primeiro
      // uso, sem migração de dados.
      ...(isLegacyPlainToken(user.googleRefreshToken)
        ? { googleRefreshToken: encryptGoogleToken(refreshToken) }
        : {}),
    },
  })

  return access_token
}

/**
 * Botão "Desconectar" do Drive: pede ao Google para cancelar o acesso e apaga os tokens.
 * Existe um único conjunto de tokens por pessoa, então a Agenda cai junto. Se o Google
 * não responder, apaga do mesmo jeito: o app esquece o acesso, e a pessoa ainda pode
 * removê-lo em myaccount.google.com.
 */
export async function disconnectGoogle(userId: string): Promise<void> {
  const { prisma } = await import("@/lib/prisma")
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { googleRefreshToken: true } })
  const refreshToken = readGoogleToken(user?.googleRefreshToken ?? null)
  if (refreshToken) {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }),
    }).catch((error) => console.error("[Google] revoke failed:", error instanceof Error ? error.message : error)) // i18n-ignore: prefixo de log de servidor, nunca exibido em tela
  }
  await disconnectGoogleCalendar(userId)
}

/** Apaga as três colunas de uma vez. */
async function disconnectGoogleCalendar(userId: string): Promise<void> {
  const { prisma } = await import("@/lib/prisma")
  await prisma.user.update({
    where: { id: userId },
    data: { googleAccessToken: null, googleRefreshToken: null, googleTokenExpiresAt: null },
  })
}
