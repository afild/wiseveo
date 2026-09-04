import { NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import {
  getQuickPaymentOptions,
  getUserQuickPaymentSettings,
  updateUserQuickPaymentSettings,
} from "@/features/settings/services/user-settings-service"
import { getSettingsUserId } from "@/features/settings/services/get-settings-user-id"
import { getSessionUserId } from "@/lib/session"

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

  const [quickPayment, options] = await Promise.all([
    getUserQuickPaymentSettings(userId),
    getQuickPaymentOptions(userId),
  ])

  return NextResponse.json({
    success: true,
    data: {
      quickPayment,
      options,
    },
  })
}

export async function PUT(request: Request) {
  const t = await getTranslations("api")
  // Escrita de dados da pessoa: identidade só da sessão. O atalho de leitura cai no usuário mais antigo fora de produção.
  const userId = await getSessionUserId()

  if (!userId) {
    return NextResponse.json(
      { success: false, message: t("errors.userNotFound") },
      { status: 401 },
    )
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { success: false, message: t("errors.invalidJson") },
      { status: 400 },
    )
  }

  const defaultAccountId = Number(body.defaultAccountId)
  const defaultStatusCode = Number(body.defaultStatusCode)

  if (!Number.isFinite(defaultAccountId) || !Number.isFinite(defaultStatusCode)) {
    return NextResponse.json(
      {
        success: false,
        message: t("user.invalidQuickPaySelection"),
      },
      { status: 400 },
    )
  }

  try {
    const data = await updateUserQuickPaymentSettings(userId, {
      defaultAccountId,
      defaultStatusCode,
    })

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : t("user.generalPreferencesSaveFailed")

    return NextResponse.json(
      { success: false, message },
      { status: 400 },
    )
  }
}
