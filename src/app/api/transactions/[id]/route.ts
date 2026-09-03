import { NextResponse, type NextRequest } from "next/server"
import { getTranslations } from "next-intl/server"

import { respondDateClosed } from "@/features/security/lib/http"
import { toDayKeyInput, toPeriodInput } from "@/features/security/lib/date-closing"
import { getWriteContext } from "@/features/security/services/write-context"
import { updateTransaction } from "@/features/transactions/services/update-transaction"

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
    return NextResponse.json(
      { error: t("errors.invalidJson") },
      { status: 400 }
    )
  }

  const { date, amount, type, accountId, groupCode, categoryCode, statusCode } =
    body

  if (
    !date ||
    amount === undefined ||
    !type ||
    !accountId ||
    !groupCode ||
    !categoryCode ||
    !statusCode
  ) {
    return NextResponse.json(
      { error: t("transactions.missingFields") },
      { status: 400 }
    )
  }

  if (!["INCOME", "EXPENSE", "TRANSFER"].includes(type as string)) {
    return NextResponse.json({ error: t("transactions.invalidType") }, { status: 400 })
  }

  // Data e competência ilegíveis param aqui: a trava de datas recusa chave fora do formato, e
  // deixar passar virava 500. O que já vem em "YYYY-MM-DD" segue intacto.
  const day = toDayKeyInput(date)
  if (!day) {
    return NextResponse.json(
      { error: t("errors.invalidDateFormat") },
      { status: 400 }
    )
  }

  let period: string | undefined
  if (body.period) {
    const parsed = toPeriodInput(body.period)
    if (!parsed) {
      return NextResponse.json(
        { error: t("errors.invalidPeriod") },
        { status: 400 }
      )
    }
    period = parsed
  }

  try {
    const transaction = await updateTransaction(
      {
        id,
        userId,
        date: day,
        period,
        reference: body.reference ? String(body.reference) : undefined,
        note: body.note ? String(body.note) : undefined,
        description: body.description ? String(body.description) : undefined,
        amount: Number(amount),
        type: type as "INCOME" | "EXPENSE" | "TRANSFER",
        accountId: Number(accountId),
        groupCode: Number(groupCode),
        categoryCode: String(categoryCode),
        statusCode: Number(statusCode),
        payeeId: body.payeeId ? Number(body.payeeId) : undefined,
        payeeName: body.payeeName ? String(body.payeeName) : undefined,
        destAccountId: body.destAccountId
          ? Number(body.destAccountId)
          : undefined,
      },
      ctx
    )

    if (!transaction) {
      return NextResponse.json(
        { error: t("errors.transactionNotFound") },
        { status: 404 }
      )
    }

    return NextResponse.json({ transaction })
  } catch (error) {
    const locked = respondDateClosed(error, t)
    if (locked) return locked
    console.error("Error updating transaction:", error)
    return NextResponse.json(
      { error: t("transactions.updateFailed") },
      { status: 500 }
    )
  }
}
