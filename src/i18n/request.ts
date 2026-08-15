import { getRequestConfig } from "next-intl/server"
import { cookies } from "next/headers"
import { LOCALE_COOKIE_NAME, resolveAppLocale } from "./config"

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const locale = resolveAppLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value)
  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  }
})
