import { NextResponse, type NextRequest } from "next/server"
import { endOfMonth } from "date-fns"
import { getTranslations } from "next-intl/server"

import { createTransaction } from "@/features/transactions/services/create-transaction"
import { getDefaultUserId } from "@/features/transactions/services/get-default-user-id"
import { respondDateClosed } from "@/features/security/lib/http"
import { toDayKeyInput, toPeriodInput } from "@/features/security/lib/date-closing"
import { getWriteContext } from "@/features/security/services/write-context"
import { getTransactions } from "@/features/transactions/services/get-transactions"
import { getAccountsWithBalance } from "@/features/accounts/services/get-accounts"
import { getFinancialSummary } from "@/features/shared/services/get-financial-summary"
import { startOfUTCDay, endOfUTCDay } from "@/lib/financial"

export async function GET(request: NextRequest) {
  const t = await getTranslations("api.errors")
  const { searchParams } = request.nextUrl
  const fromParam = searchParams.get("from")
  const toParam = searchParams.get("to")

  if (!fromParam || !toParam) {
    return NextResponse.json(
      { error: t("missingDateRange") },
      { status: 400 }
    )
  }

  const from = startOfUTCDay(fromParam)
  const to = endOfUTCDay(toParam)

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return NextResponse.json(
      { error: t("invalidDates") },
      { status: 400 }
    )
  }

  const userId = await getDefaultUserId()

  if (!userId) {
    return NextResponse.json(
      { error: t("userNotFound") },
      { status: 401 }
    )
  }

  const eom = endOfMonth(to)

  const [txData, balancesAtDate, balancesAtEndOfMonth, summary] =
    await Promise.all([
      getTransactions({ userId, from, to }),
      getAccountsWithBalance(userId, to),
      getAccountsWithBalance(userId, eom),
      getFinancialSummary(userId, from, to),
    ])

  return NextResponse.json({
    ...txData,
    balancesAtDate,
    balancesAtEndOfMonth,
    summary,
  })
}

export async function POST(request: NextRequest) {
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
    const transaction = await createTransaction(
      {
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

    return NextResponse.json({ transaction }, { status: 201 })
  } catch (error) {
    const locked = respondDateClosed(error, t)
    if (locked) return locked
    console.error("Error creating transaction:", error)
    return NextResponse.json(
      { error: t("transactions.createFailed") },
      { status: 500 }
    )
  }
}
