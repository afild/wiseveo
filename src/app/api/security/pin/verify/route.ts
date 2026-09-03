import { NextResponse, type NextRequest } from "next/server"
import { getTranslations } from "next-intl/server"

import { SecurityError, respondSecurityError } from "@/features/security/lib/http"
import { canManageClosing } from "@/features/security/lib/permissions"
import { issueOverrideToken, verifyPin } from "@/features/security/services/pin.service"
import { getWriteContext } from "@/features/security/services/write-context"

export const dynamic = "force-dynamic"

/**
 * Conferir o PIN e emitir o token de 2 minutos que autoriza escrever em dia fechado.
 *
 * O token sai amarrado a QUEM DIGITOU (`userId: ctx.actorUserId`), não só ao dono: assim o
 * cabeçalho de um convidado ADMIN não vale na mão de outro convidado.
 *
 * Sem `allowOverride`: um token ainda válido não pode servir de senha para ganhar o próximo.
 */
export async function POST(request: NextRequest) {
  const t = await getTranslations("api")
  const ctx = await getWriteContext(request, { allowOverride: false })
  if (!ctx) {
    return NextResponse.json({ error: t("errors.notAuthenticated") }, { status: 401 })
  }

  try {
    // Antes de conferir: quem não pode fechar nem reabrir não faz o contador de erros do dono
    // subir, e não descobre se existe PIN.
    if (!canManageClosing(ctx)) throw new SecurityError("forbidden", 403)

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const pin = typeof body.pin === "string" ? body.pin : ""

    // Dois argumentos, sempre: o `now` opcional de `verifyPin` é só para teste, e é ele que
    // decide se o bloqueio de 15 minutos venceu. Horário vindo do corpo dissolveria o bloqueio.
    const result = await verifyPin(ctx.ownerId, pin)
    if (!result.ok) {
      if (result.reason === "pinNotSet") throw new SecurityError("pinNotSet", 428)
      if (result.reason === "locked") throw new SecurityError("pinLocked", 429, { lockedUntil: result.lockedUntil })
      throw new SecurityError("pinInvalid", 401, { attemptsLeft: result.attemptsLeft })
    }

    const { token, expiresAt } = await issueOverrideToken({ ownerId: ctx.ownerId, userId: ctx.actorUserId })
    return NextResponse.json({ token, expiresAt })
  } catch (error) {
    const failed = respondSecurityError(error, t)
    if (failed) return failed
    console.error("Error verifying closing PIN:", error)
    return NextResponse.json({ error: t("errors.internalError") }, { status: 500 })
  }
}
