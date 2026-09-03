import { NextResponse, type NextRequest } from "next/server"
import { getTranslations } from "next-intl/server"

import { SecurityError, respondSecurityError } from "@/features/security/lib/http"
import { canManageClosing } from "@/features/security/lib/permissions"
import { closeThrough } from "@/features/security/services/date-closing.service"
import { getWriteContext } from "@/features/security/services/write-context"

export const dynamic = "force-dynamic"

/**
 * Fechar até `through`. O `today` vem do cliente de propósito (o fuso é dele); quem o compara
 * com o relógio do servidor é o serviço — a rota NÃO repete essa conta.
 *
 * Sem `allowOverride`: o token de PIN autoriza REABRIR, nunca fechar. Fechar é o movimento
 * seguro, e um cabeçalho perdido não tem por onde entrar aqui.
 */
export async function POST(request: NextRequest) {
  const t = await getTranslations("api")
  const ctx = await getWriteContext(request, { allowOverride: false })
  if (!ctx) {
    return NextResponse.json({ error: t("errors.notAuthenticated") }, { status: 401 })
  }

  try {
    // Antes de ler o banco: quem não pode fechar não fica sabendo do corte nem dos bloqueadores.
    if (!canManageClosing(ctx)) throw new SecurityError("forbidden", 403)

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const through = typeof body.through === "string" ? body.through : ""
    const today = typeof body.today === "string" ? body.today : ""

    return NextResponse.json(await closeThrough(ctx, { through, today }))
  } catch (error) {
    const failed = respondSecurityError(error, t)
    if (failed) return failed
    console.error("Error closing dates:", error)
    return NextResponse.json({ error: t("errors.internalError") }, { status: 500 })
  }
}
