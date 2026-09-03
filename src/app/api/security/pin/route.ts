import { NextResponse, type NextRequest } from "next/server"
import { getTranslations } from "next-intl/server"

import { prisma } from "@/lib/prisma"
import { SecurityError, respondSecurityError } from "@/features/security/lib/http"
import { canManagePin } from "@/features/security/lib/permissions"
import { setPin } from "@/features/security/services/pin.service"
import { getWriteContext } from "@/features/security/services/write-context"

export const dynamic = "force-dynamic"

/**
 * Definir ou redefinir o PIN de fechamento. Só o dono dos dados: um convidado ADMIN fecha e
 * reabre datas, mas não troca a chave da casa (matriz da seção 3). Não pede o PIN antigo.
 *
 * Sem `allowOverride`: o token de PIN não serve para trocar o próprio PIN.
 */
export async function PUT(request: NextRequest) {
  const t = await getTranslations("api")
  const ctx = await getWriteContext(request, { allowOverride: false })
  if (!ctx) {
    return NextResponse.json({ error: t("errors.notAuthenticated") }, { status: 401 })
  }

  try {
    // Antes de qualquer escrita: quem não é dono não chega perto do `preferences_json` dele.
    if (!canManagePin(ctx)) throw new SecurityError("forbidden", 403)

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const pin = typeof body.pin === "string" ? body.pin : ""
    const confirm = typeof body.confirm === "string" ? body.confirm : ""
    if (pin !== confirm) throw new SecurityError("pinMismatch", 400)

    // Quatro dígitos e o bcrypt são do serviço; PIN fora do formato volta como 400 `PIN_MALFORMED`.
    await setPin(prisma, ctx.ownerId, pin)

    return NextResponse.json({ success: true })
  } catch (error) {
    const failed = respondSecurityError(error, t)
    if (failed) return failed
    console.error("Error saving closing PIN:", error)
    return NextResponse.json({ error: t("errors.internalError") }, { status: 500 })
  }
}
