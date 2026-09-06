import { NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import {
  getUserRadarPreferences,
  updateUserRadarPreferences,
} from "@/features/settings/services/user-settings-service"
import { getSettingsUserId } from "@/features/settings/services/get-settings-user-id"
import { getSessionUserId } from "@/lib/session"

export const dynamic = "force-dynamic"

export async function GET() {
  const t = await getTranslations("api.errors")
  const userId = await getSettingsUserId()
  if (!userId) {
    return NextResponse.json({ success: false, message: t("userNotFound") }, { status: 401 })
  }

  return NextResponse.json({ success: true, data: await getUserRadarPreferences(userId) })
}

export async function PUT(request: Request) {
  const t = await getTranslations("api.errors")
  // Escrita de dados da pessoa: identidade só da sessão, igual à rota de moeda.
  const userId = await getSessionUserId()
  if (!userId) {
    return NextResponse.json({ success: false, message: t("userNotFound") }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, message: t("invalidJson") }, { status: 400 })
  }

  const data = await updateUserRadarPreferences(userId, body)
  if (!data) {
    return NextResponse.json(
      { success: false, message: t("invalidRadarPreferences") },
      { status: 400 },
    )
  }

  return NextResponse.json({ success: true, data })
}
