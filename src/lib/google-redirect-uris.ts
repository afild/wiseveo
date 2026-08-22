/**
 * Endereços de retorno (redirect_uri) do OAuth do Google para UMA instalação.
 *
 * Fonte única: o fluxo de login/calendário (src/lib/google-auth.ts) e o guia
 * "Ative o login com Google" da tela de primeiro acesso leem daqui — o que a
 * pessoa cadastra no Google Cloud é, por construção, o que o app envia.
 *
 * Módulo puro (sem Node/Next) para poder ser importado por client components.
 */
export const GOOGLE_LOGIN_CALLBACK_PATH = "/api/auth/google/callback"
export const GOOGLE_CALENDAR_CALLBACK_PATH = "/api/calendar/connect-google/callback"

export interface GoogleRedirectUris {
  /** Entrar com Google (identidade). */
  login: string
  /** Conectar o Google Calendar (escopo calendar.events). */
  calendar: string
}

/** `appUrl` = origem pública da instalação (getAppUrl), com ou sem barra final. */
export function getGoogleRedirectUris(appUrl: string): GoogleRedirectUris {
  const base = appUrl.replace(/\/+$/, "")
  return {
    login: `${base}${GOOGLE_LOGIN_CALLBACK_PATH}`,
    calendar: `${base}${GOOGLE_CALENDAR_CALLBACK_PATH}`,
  }
}
