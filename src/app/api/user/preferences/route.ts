import { NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import {
  getUserAppearanceSettings,
  setUserLocale,
  updateUserAppearance,
} from "@/features/settings/services/user-settings-service"
import { getSettingsUserId } from "@/features/settings/services/get-settings-user-id"
import { getSessionUserId } from "@/lib/session"
import { normalizeThemePreferences } from "@/lib/theme-preferences"
import { isAppLocale } from "@/i18n/config"

export const dynamic = "force-dynamic"

export async function GET() {
  const t = await getTranslations("api.errors")
  const userId = await getSettingsUserId()

  if (!userId) {
    return NextResponse.json(
      { success: false, message: t("userNotFound") },
      { status: 401 },
    )
  }

  const data = await getUserAppearanceSettings(userId)

  return NextResponse.json({
    success: true,
    data,
  })
}

export async function PUT(request: Request) {
  const t = await getTranslations("api.errors")
  // Escrita de dados da pessoa: identidade só da sessão. O atalho de leitura cai no usuário mais antigo fora de produção.
  const userId = await getSessionUserId()

  if (!userId) {
    return NextResponse.json(
      { success: false, message: t("userNotFound") },
      { status: 401 },
    )
  }

  const body = await request.json()
  const data = await updateUserAppearance(
    userId,
    normalizeThemePreferences(body),
  )

  return NextResponse.json({
    success: true,
    data: data.themePreferences ?? null,
  })
}

/**
 * Persists the user's UI locale (dual-write alongside the NEXT_LOCALE
 * cookie set by LocaleSwitcher) so cookie-less channels — Telegram, jobs —
 * can resolve it via getUserLocale(). Invalid/missing locales are ignored.
 */
export async function PATCH(request: Request) {
  // Escrita de dados da pessoa: identidade só da sessão. O atalho de leitura cai no usuário mais antigo fora de produção.
  const userId = await getSessionUserId()

  if (!userId) {
    const t = await getTranslations("api.errors")
    return NextResponse.json(
      { success: false, message: t("userNotFound") },
      { status: 401 },
    )
  }

  const body = await request.json().catch(() => ({}))

  if (isAppLocale(body?.locale)) {
    await setUserLocale(userId, body.locale)
  }

  return NextResponse.json({ success: true })
}
