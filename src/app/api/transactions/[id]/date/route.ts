import { NextResponse, type NextRequest } from "next/server"
import { getTranslations } from "next-intl/server"

import { getWriteContext } from "@/features/security/services/write-context"
import { updateTransactionDate } from "@/features/transactions/services/update-transaction-date"

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

  if (!body.date) {
    return NextResponse.json(
      { error: t("errors.missingField", { field: "date" }) },
      { status: 400 }
    )
  }

  try {
    const transaction = await updateTransactionDate(id, userId, String(body.date), ctx)

    if (!transaction) {
      return NextResponse.json(
        { error: t("errors.transactionNotFound") },
        { status: 404 }
      )
    }

    return NextResponse.json({ transaction })
  } catch (error) {
    console.error("Error updating transaction date:", error)
    return NextResponse.json(
      { error: t("transactions.updateDateFailed") },
      { status: 500 }
    )
  }
}
