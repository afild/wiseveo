import { NextResponse, type NextRequest } from "next/server"
import { getTranslations } from "next-intl/server"

import { prisma } from "@/lib/prisma"
import { createTransaction } from "@/features/transactions/services/create-transaction"
import { getWriteContext } from "@/features/security/services/write-context"
import { periodFromDate } from "@/lib/financial"

function getTodayLocalDateString() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, "0")
  const day = String(today.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function getRecurringDateString(date: Date | null) {
  if (!date) return getTodayLocalDateString()
  return date.toISOString().slice(0, 10)
}

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
    const launchDate = getRecurringDateString(recurring.lastDate)

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
    console.error("Error launching transaction from recurring:", error)
    return NextResponse.json(
      { error: t("recurringTransactions.launchFailed") },
      { status: 500 }
    )
  }
}
