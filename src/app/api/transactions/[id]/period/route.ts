import { NextResponse, type NextRequest } from "next/server"
import { getTranslations } from "next-intl/server"

import { respondDateClosed } from "@/features/security/lib/http"
import { toPeriodInput } from "@/features/security/lib/date-closing"
import { getWriteContext } from "@/features/security/services/write-context"
import { updateTransactionPeriod } from "@/features/transactions/services/update-transaction-period"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t = await getTranslations("api")
  // O contexto de escrita (ator + dono + token de PIN) substitui o userId solto.
  const ctx = await getWriteContext(request)
  if (!ctx) {
    return NextResponse.json(
      { error: t("errors.userNotFound") },
      { status: 401 }
    )
  }
  const userId = ctx.ownerId

  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: t("errors.invalidJson") }, { status: 400 })
  }

  if (!body.period) {
    return NextResponse.json(
      { error: t("errors.missingField", { field: "period" }) },
      { status: 400 }
    )
  }

  // Competência fora de "YYYYMM" para aqui: a trava de datas recusa chave fora do formato, e
  // deixar passar virava 500.
  const period = toPeriodInput(body.period)
  if (!period) {
    return NextResponse.json(
      { error: t("errors.invalidPeriod") },
      { status: 400 }
    )
  }

  try {
    const result = await updateTransactionPeriod(id, userId, period, ctx)

    if (result && "error" in result) {
      return NextResponse.json(
        { error: t("errors.invalidPeriod") },
        { status: 400 }
      )
    }

    if (!result) {
      return NextResponse.json(
        { error: t("errors.transactionNotFound") },
        { status: 404 }
      )
    }

    return NextResponse.json({ transaction: result })
  } catch (error) {
    const locked = respondDateClosed(error, t)
    if (locked) return locked
    console.error("Error updating transaction period:", error)
    return NextResponse.json(
      { error: t("transactions.updatePeriodFailed") },
      { status: 500 }
    )
  }
}
