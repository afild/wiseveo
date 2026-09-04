import { NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import {
  getUserMonetarySettings,
  updateUserMonetarySettings,
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

  const data = await getUserMonetarySettings(userId)

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
  const data = await updateUserMonetarySettings(userId, body)

  return NextResponse.json({
    success: true,
    data,
  })
}
