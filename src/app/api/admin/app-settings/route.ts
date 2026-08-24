import { NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import { isSuperAdminSession } from "@/lib/setup-access"
import { redactConnectionUrl } from "@/features/setup/lib/connection-url"
import {
  applyAppSettingsStructure,
  AppSettingsError,
  readAppSettingsStructure,
} from "@/features/settings/services/app-settings-service"

export const dynamic = "force-dynamic"

/**
 * Preparar o banco para os segredos da instalação (`app_settings`) — mesma
 * disciplina da rota dos convites (`admin/shared-account`): estrutura só muda
 * acrescentando, pelo app, com o SUPERADMIN mandando. Fora isso, 404.
 */
async function guard(): Promise<boolean> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return false
  return isSuperAdminSession()
}

export async function GET() {
  if (!(await guard())) return new NextResponse(null, { status: 404 })
  try {
    return NextResponse.json({ success: true, data: await readAppSettingsStructure() })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST() {
  if (!(await guard())) return new NextResponse(null, { status: 404 })
  try {
    const structure = await applyAppSettingsStructure()
    console.log("[APP SETTINGS] Structure applied by the account owner")
    return NextResponse.json({ success: true, data: structure })
  } catch (error) {
    return errorResponse(error)
  }
}

async function errorResponse(error: unknown) {
  // As mensagens de "preparar o banco" são genéricas de propósito e já existem em
  // api.sharedAccount — reutilizadas aqui em vez de duplicar o bloco nos 3 idiomas.
  const t = await getTranslations("api.sharedAccount")
  if (error instanceof AppSettingsError && error.code !== "tableMissing") {
    const tConnection = await getTranslations("api.setup.errors")
    const message =
      error.connectionCode && error.connectionCode !== "unknown"
        ? tConnection(error.connectionCode)
        : error.code === "applyFailed"
          ? t("applyFailed", { message: redactConnectionUrl(error.detail ?? "") })
          : t(error.code)
    console.error(`[APP SETTINGS] ${error.code}:`, redactConnectionUrl(error.detail ?? ""))
    return NextResponse.json({ success: false, code: error.code, message }, { status: 400 })
  }
  console.error("[APP SETTINGS] unexpected:", error)
  const tErrors = await getTranslations("api.errors")
  return NextResponse.json({ success: false, message: tErrors("internalError") }, { status: 500 })
}
