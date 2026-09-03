import { NextResponse, type NextRequest } from "next/server"
import { getTranslations } from "next-intl/server"

import { SecurityError, respondSecurityError } from "@/features/security/lib/http"
import { canManageClosing } from "@/features/security/lib/permissions"
import { reopenFrom } from "@/features/security/services/date-closing.service"
import { getWriteContext } from "@/features/security/services/write-context"

export const dynamic = "force-dynamic"

/**
 * Reabrir a partir de `from`. É a ÚNICA rota que aceita o cabeçalho `x-wiseveo-pin-token`: por
 * isso o contexto é montado sem `allowOverride: false`. O token já chega conferido (assinatura,
 * dono e pessoa) pelo `getWriteContext`; quem exige a presença dele é o serviço, que responde
 * 401 `PIN_REQUIRED` quando falta.
 */
export async function POST(request: NextRequest) {
  const t = await getTranslations("api")
  const ctx = await getWriteContext(request)
  if (!ctx) {
    return NextResponse.json({ error: t("errors.notAuthenticated") }, { status: 401 })
  }

  try {
    // Antes de ler o banco: quem não pode reabrir não descobre o corte por tentativa e erro.
    if (!canManageClosing(ctx)) throw new SecurityError("forbidden", 403)

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const from = typeof body.from === "string" ? body.from : ""

    return NextResponse.json(await reopenFrom(ctx, from))
  } catch (error) {
    const failed = respondSecurityError(error, t)
    if (failed) return failed
    console.error("Error reopening dates:", error)
    return NextResponse.json({ error: t("errors.internalError") }, { status: 500 })
  }
}
