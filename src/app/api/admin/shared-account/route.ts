import { NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import { isSuperAdminSession } from "@/lib/setup-access"
import { redactConnectionUrl } from "@/features/setup/lib/connection-url"
import {
  applySharedAccountStructure,
  readSharedAccountStructure,
  SharedAccountError,
} from "@/features/settings/services/shared-account-service"

export const dynamic = "force-dynamic"

/**
 * Preparar o banco para os convites. Só o SUPERADMIN (o dono dos dados) chega aqui —
 * é a única rota do app que altera a estrutura do banco, e nunca sem ele mandar.
 * Fora isso, 404: nem existe para os demais.
 */
async function guard(): Promise<boolean> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return false
  return isSuperAdminSession()
}

export async function GET() {
  if (!(await guard())) return new NextResponse(null, { status: 404 })
  try {
    return NextResponse.json({ success: true, data: await readSharedAccountStructure() })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST() {
  if (!(await guard())) return new NextResponse(null, { status: 404 })
  try {
    const structure = await applySharedAccountStructure()
    console.log("[SHARED ACCOUNT] Structure applied by the account owner")
    return NextResponse.json({ success: true, data: structure })
  } catch (error) {
    return errorResponse(error)
  }
}

async function errorResponse(error: unknown) {
  const t = await getTranslations("api.sharedAccount")
  if (error instanceof SharedAccountError) {
    // Falha de conexão tem explicação pronta e traduzida (as mesmas do Setup Wizard):
    // "senha incorreta", "esse endereço é o direto, use o pooler"… — muito mais útil
    // do que repetir o texto cru do Postgres.
    const tConnection = await getTranslations("api.setup.errors")
    const message =
      error.connectionCode && error.connectionCode !== "unknown"
        ? tConnection(error.connectionCode)
        : error.code === "applyFailed"
          ? t("applyFailed", { message: redactConnectionUrl(error.detail ?? "") })
          : t(error.code)
    console.error(`[SHARED ACCOUNT] ${error.code}:`, redactConnectionUrl(error.detail ?? ""))
    return NextResponse.json({ success: false, code: error.code, message }, { status: 400 })
  }
  console.error("[SHARED ACCOUNT] unexpected:", error)
  const tErrors = await getTranslations("api.errors")
  return NextResponse.json({ success: false, message: tErrors("internalError") }, { status: 500 })
}
