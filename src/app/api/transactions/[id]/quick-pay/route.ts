import { NextResponse, type NextRequest } from "next/server"
import { getTranslations } from "next-intl/server"

import { respondDateClosed } from "@/features/security/lib/http"
import { getWriteContext } from "@/features/security/services/write-context"
import { quickPayTransaction } from "@/features/transactions/services/quick-pay-transaction"

export async function POST(
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
    const locked = respondDateClosed(error, t)
    if (locked) return locked
    console.error("Error quick-paying transaction:", error)
    return NextResponse.json(
      { error: t("transactions.quickPayFailed") },
      { status: 500 }
    )
  }
}
