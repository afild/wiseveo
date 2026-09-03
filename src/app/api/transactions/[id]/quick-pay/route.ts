import { NextResponse, type NextRequest } from "next/server"
import { getTranslations } from "next-intl/server"

import { getWriteContext } from "@/features/security/services/write-context"
import { quickPayTransaction } from "@/features/transactions/services/quick-pay-transaction"

export async function POST(
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

  try {
    const result = await quickPayTransaction(id, userId, ctx)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error quick-paying transaction:", error)
    return NextResponse.json(
      { error: t("transactions.quickPayFailed") },
      { status: 500 }
    )
  }
}
