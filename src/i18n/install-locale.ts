import { isAppLocale, resolveAppLocale, type AppLocale } from "./config"

/**
 * Idioma da instalação — o que foi escolhido no Setup Wizard.
 *
 * Fica fora de config.ts de propósito: config.ts é importado por client components
 * e `process.env.WISEVEO_DEFAULT_LOCALE` só existe no servidor.
 *
 * Cadeia de resolução do idioma da UI (src/i18n/request.ts):
 *   cookie NEXT_LOCALE → env WISEVEO_DEFAULT_LOCALE → DEFAULT_LOCALE (en-US)
 */

/** Nome da env gravada pelo Setup Wizard em .env.local (na Vercel: definir no painel). */
export const INSTALL_LOCALE_ENV = "WISEVEO_DEFAULT_LOCALE"

/** Idioma padrão da instalação: env válida → ela; senão DEFAULT_LOCALE. */
export function getInstallDefaultLocale(): AppLocale {
  return resolveAppLocale(process.env.WISEVEO_DEFAULT_LOCALE)
}

/** Como resolveAppLocale, mas cai no idioma da instalação em vez do padrão global. */
export function resolveLocaleOrInstallDefault(value: unknown): AppLocale {
  return isAppLocale(value) ? value : getInstallDefaultLocale()
}
