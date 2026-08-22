import type { NextResponse } from "next/server"
import { isAppLocale, LOCALE_COOKIE_NAME, type AppLocale } from "./config"

/**
 * Idioma que acompanha a PESSOA ao abrir sessão.
 *
 * A escolha feita em Configurações → Aparência fica em `User.preferencesJson.locale`;
 * o cookie `NEXT_LOCALE` (lido por src/i18n/request.ts) é o que a interface usa.
 * Num navegador limpo os dois divergem — então, ao criar a sessão (login por senha,
 * retorno do Google, aceite de convite), gravamos o cookie a partir da preferência.
 * Sem preferência válida, nada é gravado: vale o cookie atual ou o padrão da instalação.
 *
 * Atributos idênticos aos do seletor de idioma (`applyUserLocale`): 1 ano, path `/`,
 * NÃO httpOnly (o seletor no navegador também grava/lê esse cookie), SameSite Lax.
 */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function pickSessionLocale(preferences: unknown): AppLocale | null {
  if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)) return null
  const locale = (preferences as { locale?: unknown }).locale
  return isAppLocale(locale) ? locale : null
}

export function applySessionLocaleCookie(response: NextResponse, preferences: unknown): AppLocale | null {
  const locale = pickSessionLocale(preferences)
  if (!locale) return null
  response.cookies.set(LOCALE_COOKIE_NAME, locale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
    httpOnly: false,
  })
  return locale
}
