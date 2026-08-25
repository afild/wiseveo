import { NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import { isSuperAdminSession } from "@/lib/setup-access"
import { getAppUrl } from "@/lib/app-url"
import { AppSettingsError } from "@/features/settings/services/app-settings-service"
import {
  clearTickSecret,
  getTickSecretStatus,
  rotateTickSecret,
} from "@/features/notifications/services/tick-secret.service"

/**
 * A chave do despertador (Configurações → Integrações, só SUPERADMIN).
 *
 * O endereço completo — com o segredo dentro — só existe na resposta do POST que
 * o gerou. Depois disso a tela mostra apenas "configurado": quem perder o link
 * gera outro, e o anterior morre na hora.
 */

export const dynamic = "force-dynamic"

async function guard(): Promise<boolean> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return false
  return isSuperAdminSession()
}

export async function GET() {
  if (!(await guard())) return new NextResponse(null, { status: 404 })
  try {
    return NextResponse.json({ success: true, data: await getTickSecretStatus() })
  } catch (error) {
    return failure(error)
  }
}

export async function POST(request: Request) {
  if (!(await guard())) return new NextResponse(null, { status: 404 })
  try {
    const secret = await rotateTickSecret()
    // O endereço tem de ser o que a pessoa está usando agora (app.wiseveo.com,
    // e não localhost): é ele que vai colado no despertador externo.
    const url = `${getAppUrl(request)}/api/cron/tick?key=${encodeURIComponent(secret)}`
    console.log("[NOTIFICATIONS] tick secret rotated by the account owner")
    return NextResponse.json({ success: true, data: { url, configured: true, source: "db" } })
  } catch (error) {
    return failure(error)
  }
}

export async function DELETE() {
  if (!(await guard())) return new NextResponse(null, { status: 404 })
  try {
    await clearTickSecret()
    return NextResponse.json({ success: true, data: await getTickSecretStatus() })
  } catch (error) {
    return failure(error)
  }
}

async function failure(error: unknown) {
  if (error instanceof AppSettingsError && error.code === "tableMissing") {
    // Mesma explicação dos convites: falta preparar o banco.
    const t = await getTranslations("api.sharedAccount")
    return NextResponse.json(
      { success: false, code: error.code, message: t("stillMissing") },
      { status: 400 },
    )
  }
  console.error("[NOTIFICATIONS] tick secret failed:", error)
  const t = await getTranslations("api.errors")
  return NextResponse.json({ success: false, message: t("internalError") }, { status: 500 })
}
