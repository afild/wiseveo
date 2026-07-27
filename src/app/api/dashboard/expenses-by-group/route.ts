import { NextResponse, type NextRequest } from "next/server"
import { getTranslations } from "next-intl/server"

import { prisma } from "@/lib/prisma"
import { getDefaultUserId } from "@/features/transactions/services/get-default-user-id"

export interface ExpenseGroupItem {
  groupCode: string
  groupName: string
  amount: number
  paid: number
  scheduled: number
  percentage: number
}

function parseDateBoundary(value: string, endOfDay: boolean): Date | null {
  const dateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/)

  if (dateMatch) {
    const [, y, m, d] = dateMatch
    const year = Number(y)
    const month = Number(m)
    const day = Number(d)

    return endOfDay
      ? new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999))
      : new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null

  return endOfDay
    ? new Date(
      Date.UTC(
        parsed.getUTCFullYear(),
        parsed.getUTCMonth(),
        parsed.getUTCDate(),
        23, 59, 59, 999,
      ),
    )
    : new Date(
      Date.UTC(
        parsed.getUTCFullYear(),
        parsed.getUTCMonth(),
        parsed.getUTCDate(),
        0, 0, 0, 0,
      ),
    )
}

export async function GET(request: NextRequest) {
  const t = await getTranslations("api.errors")
  const tChart = await getTranslations("dashboard.ExpensesChart")
  // Rótulo do bucket sintético (transferências, sem grupo, agregado do top-5).
  // Não é dado do plano de contas — é UI gerada pela rota, por isso traduz aqui.
  const othersLabel = tChart("othersGroup")
  const { searchParams } = request.nextUrl
  const fromParam = searchParams.get("from")
  const toParam = searchParams.get("to")

  if (!fromParam || !toParam) {
    return NextResponse.json(
      { error: t("missingDateRange") },
      { status: 400 },
    )
  }

  const from = parseDateBoundary(fromParam, false)
  const to = parseDateBoundary(toParam, true)

  if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: t("invalidDates") }, { status: 400 })
  }

  const userId = await getDefaultUserId()

  if (!userId) {
    return NextResponse.json({ error: t("userNotFound") }, { status: 401 })
  }

  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      date: { gte: from, lte: to },
      OR: [
        { type: "EXPENSE" },
        { type: "TRANSFER", amount: { lt: 0 } },
      ],
    },
    select: {
      amount: true,
      groupCode: true,
      type: true,
      statusLookup: {
        select: {
          name: true,
        },
      },
      category: {
        select: {
          group: {
            select: {
              code: true,
              name: true,
            },
          },
        },
      },
    },
  })

  const groupMap = new Map<number, { name: string; total: number; paid: number; scheduled: number }>()

  for (const tx of transactions) {
    const isTransfer = tx.type === "TRANSFER"
    const code = isTransfer ? -1 : (tx.groupCode ?? tx.category?.group?.code ?? 0)
    let name = isTransfer ? othersLabel : (tx.category?.group?.name ?? othersLabel)

    // Grupo do plano de contas literalmente chamado "Others" (seed atual) ou
    // "Outros" (seed pt-BR legado) é exibido com o mesmo rótulo traduzido do
    // bucket sintético.
    const groupName = name.toLowerCase()
    if (groupName === "outros" || groupName === "others") {
      name = othersLabel
    }

    const absAmount = Math.abs(Number(tx.amount ?? 0))
    const statusName = tx.statusLookup?.name?.toLowerCase()
    const isPaid = statusName === "pago" || statusName === "paid"

    const existing = groupMap.get(code)
    if (existing) {
      existing.total += absAmount
      if (isPaid) existing.paid += absAmount
      else existing.scheduled += absAmount
    } else {
      groupMap.set(code, {
        name,
        total: absAmount,
        paid: isPaid ? absAmount : 0,
        scheduled: isPaid ? 0 : absAmount,
      })
    }
  }

  const totalExpense = Array.from(groupMap.values()).reduce(
    (sum, g) => sum + g.total,
    0,
  )

  let sortedGroups: ExpenseGroupItem[] = Array.from(groupMap.entries())
    .map(([groupCode, { name, total, paid, scheduled }]) => ({
      groupCode: String(groupCode),
      groupName: name,
      amount: total,
      paid,
      scheduled,
      percentage: totalExpense > 0 ? (total / totalExpense) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount)

  if (sortedGroups.length > 5) {
    const top5 = sortedGroups.slice(0, 5)
    const others = sortedGroups.slice(5)
    const othersTotal = others.reduce((sum, g) => sum + g.amount, 0)
    const othersPaid = others.reduce((sum, g) => sum + g.paid, 0)
    const othersScheduled = others.reduce((sum, g) => sum + g.scheduled, 0)
    
    // O grupo do plano de contas chamado "Others"/"Outros" já é exibido com o
    // rótulo traduzido `othersLabel`. Se ele estiver entre os 5 primeiros, a
    // cauda é somada NELE — senão o anel mostraria duas fatias "Outros".
    const existingOthers = top5.find((g) => g.groupName === othersLabel)
    if (existingOthers) {
      existingOthers.amount += othersTotal
      existingOthers.paid += othersPaid
      existingOthers.scheduled += othersScheduled
      existingOthers.percentage =
        totalExpense > 0 ? (existingOthers.amount / totalExpense) * 100 : 0
    } else {
      top5.push({
        groupCode: "others",
        groupName: othersLabel,
        amount: othersTotal,
        paid: othersPaid,
        scheduled: othersScheduled,
        percentage: totalExpense > 0 ? (othersTotal / totalExpense) * 100 : 0,
      })
    }

    sortedGroups = top5.sort((a, b) => b.amount - a.amount)
  }

  return NextResponse.json({ groups: sortedGroups, totalExpense })
}
