import { getRequestConfig } from "next-intl/server"
import { cookies } from "next/headers"
import { LOCALE_COOKIE_NAME } from "./config"
import { resolveLocaleOrInstallDefault } from "./install-locale"

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  // cookie → idioma da instalação (env) → padrão global (en-US)
  const locale = resolveLocaleOrInstallDefault(cookieStore.get(LOCALE_COOKIE_NAME)?.value)
  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  }
})
