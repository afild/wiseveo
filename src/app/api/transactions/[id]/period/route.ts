import { NextResponse, type NextRequest } from "next/server"
import { getTranslations } from "next-intl/server"

import { getWriteContext } from "@/features/security/services/write-context"
import { updateTransactionPeriod } from "@/features/transactions/services/update-transaction-period"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t = await getTranslations("api")
  // Tarefa 8a: o contexto de escrita (ator + dono + token de PIN) substitui o userId solto.
  // A resposta 423 do DATE_CLOSED entra na Tarefa 8b.
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

  try {
    const result = await updateTransactionPeriod(
      id,
      userId,
      String(body.period),
      ctx
    )

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
    console.error("Error updating transaction period:", error)
    return NextResponse.json(
      { error: t("transactions.updatePeriodFailed") },
      { status: 500 }
    )
  }
}
