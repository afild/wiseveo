/** Ordem = ordem de exibição em todos os seletores: alfabética pelo nome nativo
 *  (English → Español → Português). Nada depende da posição no array. */
export const LOCALES = ["en-US", "es-419", "pt-BR"] as const
export type AppLocale = (typeof LOCALES)[number]
/** Padrão global da plataforma quando não há idioma escolhido (cookie) nem idioma
 *  da instalação (env — ver src/i18n/install-locale.ts). */
export const DEFAULT_LOCALE: AppLocale = "en-US"
/** Idioma com que todo usuário DEMO recém-provisionado nasce (igual ao padrão global;
 *  mantido como constante própria porque o provisionamento da demo o grava explicitamente). */
export const DEMO_DEFAULT_LOCALE: AppLocale = "en-US"
/** Nome do cookie lido por src/i18n/request.ts e gravado pelos seletores de idioma. */
export const LOCALE_COOKIE_NAME = "NEXT_LOCALE"

interface LocaleMeta {
  /** Tag BCP-47 usada em <html lang> e Intl.*; ponto único de indireção caso um ID interno volte a divergir da tag de formatação. */
  intlLocale: string
  label: string
  /** Caminho da bandeira circular em public/flags (conjunto completo em
   *  public/flags — HatScripts/circle-flags, MIT — para idiomas futuros). */
  flagSrc: string
}

// i18n-ignore: nomes nativos dos idiomas — sempre exibidos no próprio idioma, nunca traduzidos.
export const LOCALE_META: Record<AppLocale, LocaleMeta> = {
  "en-US": { intlLocale: "en-US", label: "English (US)", flagSrc: "/flags/us.svg" },
  "es-419": { intlLocale: "es-419", label: "Español (ES)", flagSrc: "/flags/es.svg" }, // i18n-ignore
  "pt-BR": { intlLocale: "pt-BR", label: "Português (BR)", flagSrc: "/flags/br.svg" }, // i18n-ignore
}

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value)
}

export function resolveAppLocale(value: unknown): AppLocale {
  return isAppLocale(value) ? value : DEFAULT_LOCALE
}
