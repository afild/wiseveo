import { NextResponse, type NextRequest } from "next/server"
import { getTranslations } from "next-intl/server"

import { prisma } from "@/lib/prisma"
import { createTransaction } from "@/features/transactions/services/create-transaction"
import { DateClosedError, respondDateClosed } from "@/features/security/lib/http"
import { dayKeyOfLocal, dayKeyOfStored, isDayKey } from "@/features/security/lib/date-closing"
import { getWriteContext } from "@/features/security/services/write-context"
import { periodFromDate } from "@/lib/financial"

function getRecurringDateString(date: Date | null) {
  if (!date) return dayKeyOfLocal(new Date())
  return dayKeyOfStored(date)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t = await getTranslations("api")
  // Lançar recorrente NUNCA passa com PIN: repetiria o lançamento dentro do período fechado. Por
  // isso o token do cabeçalho é descartado aqui, e a janela oferece escolher outra data.
  const ctx = await getWriteContext(request, { allowOverride: false })
  if (!ctx) {
    return NextResponse.json(
      { error: t("errors.userNotFound") },
      { status: 401 }
    )
  }
  const userId = ctx.ownerId

  // Corpo opcional: sem ele, vale a regra antiga do lastDate.
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  if (body.date !== undefined && !isDayKey(body.date)) {
    return NextResponse.json(
      { error: t("errors.invalidDateFormat") },
      { status: 400 }
    )
  }

  const { id } = await params

  const recurring = await prisma.recurringTransaction.findFirst({
    where: { id, userId },
    select: {
      id: true,
      note: true,
      description: true,
      amount: true,
      type: true,
      accountId: true,
      groupCode: true,
      categoryCode: true,
      statusCode: true,
      payeeId: true,
      reference: true,
      lastDate: true,
    },
  })

  if (!recurring) {
    return NextResponse.json(
      { error: t("errors.recurrenceNotFound") },
      { status: 404 }
    )
  }

  try {
    // A data escolhida na janela vira a data da recorrência: o modelo passa a apontar para ela.
    const launchDate = typeof body.date === "string" ? body.date : getRecurringDateString(recurring.lastDate)

    const transaction = await createTransaction(
      {
        userId,
        date: launchDate,
        period: periodFromDate(launchDate),
        reference: recurring.reference ?? undefined,
        note: recurring.note ?? undefined,
        description: recurring.description ?? undefined,
        amount: Number(recurring.amount),
        type: recurring.type,
        accountId: recurring.accountId,
        groupCode: recurring.groupCode,
        categoryCode: recurring.categoryCode,
        statusCode: recurring.statusCode,
        payeeId: recurring.payeeId ?? undefined,
      },
      ctx
    )

    await prisma.recurringTransaction.update({
      where: { id: recurring.id },
      data: {
        lastDate: transaction.date,
        period: periodFromDate(transaction.date),
      },
    })

    return NextResponse.json(
      {
        success: true,
        transaction,
        recurring: {
          id: recurring.id,
          lastDate: transaction.date,
          period: periodFromDate(transaction.date),
        },
      },
      { status: 201 }
    )
  } catch (error) {
    // O 423 daqui sai SEMPRE com canOverride falso, mesmo para o dono com token válido: oferecer o
    // PIN levaria a repetir o lançamento dentro do período fechado. A saída é outra data.
    const locked = respondDateClosed(
      error instanceof DateClosedError
        ? new DateClosedError(error.days, error.periods, error.closedThrough, false)
        : error,
      t
    )
    if (locked) return locked
    console.error("Error launching transaction from recurring:", error)
    return NextResponse.json(
      { error: t("recurringTransactions.launchFailed") },
      { status: 500 }
    )
  }
}
