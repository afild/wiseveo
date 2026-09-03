import { NextResponse, type NextRequest } from "next/server"
import { getTranslations } from "next-intl/server"

import { SecurityError, respondSecurityError } from "@/features/security/lib/http"
import { canManageClosing } from "@/features/security/lib/permissions"
import { countProtected } from "@/features/security/services/date-closing.service"
import { getWriteContext } from "@/features/security/services/write-context"

export const dynamic = "force-dynamic"

/**
 * Quantos lançamentos deixam de estar protegidos ao reabrir a partir de `from`. É a frase que a
 * janela de reabertura mostra ANTES de pedir o PIN — por isso não exige token, só permissão.
 *
 * Sem `allowOverride`: contar não é escrever.
 */
export async function GET(request: NextRequest) {
  const t = await getTranslations("api")
  const ctx = await getWriteContext(request, { allowOverride: false })
  if (!ctx) {
    return NextResponse.json({ error: t("errors.notAuthenticated") }, { status: 401 })
  }

  try {
    // Antes de contar: a contagem já é informação sobre os dados do dono.
    if (!canManageClosing(ctx)) throw new SecurityError("forbidden", 403)

    const from = request.nextUrl.searchParams.get("from") ?? ""

    return NextResponse.json(await countProtected(ctx, from))
  } catch (error) {
    const failed = respondSecurityError(error, t)
    if (failed) return failed
    console.error("Error previewing reopen:", error)
    return NextResponse.json({ error: t("errors.internalError") }, { status: 500 })
  }
}
