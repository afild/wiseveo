import { getRequestConfig } from "next-intl/server"
import { cookies } from "next/headers"
import { isAppLocale, LOCALE_COOKIE_NAME } from "./config"
import { resolveLocaleOrInstallDefault } from "./install-locale"

/**
 * Idioma de tudo que o SERVIDOR traduz.
 *
 * Dois caminhos, nesta ordem:
 * 1. Idioma PEDIDO explicitamente — `getTranslations({locale, namespace})`. É o
 *    caso dos canais sem cookie: o bot do Telegram, a página Advisor e os avisos
 *    automáticos, que resolvem o idioma da PESSOA (`getUserLocale`) e o passam
 *    adiante. Sem honrar esse pedido, uma casa trilíngue receberia tudo no
 *    idioma da instalação, e o parâmetro seria decoração.
 * 2. Sem pedido explícito (o desenho normal das telas): cookie → idioma da
 *    instalação (env) → padrão global (en-US).
 */
export default getRequestConfig(async ({ locale }) => {
  const resolved = isAppLocale(locale)
    ? locale
    : resolveLocaleOrInstallDefault((await cookies()).get(LOCALE_COOKIE_NAME)?.value)

  return {
    locale: resolved,
    messages: (await import(`./messages/${resolved}.json`)).default,
  }
})
