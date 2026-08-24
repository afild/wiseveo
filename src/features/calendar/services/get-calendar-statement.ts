import { prisma } from "@/lib/prisma"
import { isPaidStatusName } from "@/lib/paid-status"
import { safeBalance } from "@/lib/financial"
import type {
  CalendarDayStatement,
  CalendarTransaction,
  CalendarStatementResponse,
} from "../types"

const STATUS_MAP: Record<string, CalendarTransaction["status"]> = {
  PAGO: "PAID",
  ABERTO: "SCHEDULED",
  PENDENTE: "PENDING",
  VENCIDO: "OVERDUE",
  PAID: "PAID",
  SCHEDULED: "SCHEDULED",
  PENDING: "PENDING",
  OVERDUE: "OVERDUE",
}

function utcDateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

/**
 * Builds a calendar statement: every day in the range has an entry with
 * individual transactions, opening balance and closing balance.
 *
 * Days without transactions still appear (balance carried forward).
 */
export async function getCalendarStatement(
  userId: string,
  from: Date,
  to: Date,
): Promise<CalendarStatementResponse> {
  // --- opening balance (same pattern as getDailyStatement) ----------------
  const [accounts, txBeforeAgg] = await Promise.all([
    prisma.account.findMany({
      where: { userId, active: true },
      select: { balance: true },
    }),
    prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { userId, date: { lt: from } },
    }),
  ])

  const initialSum = accounts.reduce(
    (sum, acc) => sum + safeBalance(acc.balance),
    0,
  )
  const openingBalance = initialSum + (txBeforeAgg._sum.amount ?? 0)

  // --- transactions in range with includes --------------------------------
  const transactions = await prisma.transaction.findMany({
    where: { userId, date: { gte: from, lte: to } },
    orderBy: [{ date: "asc" }, { num: "asc" }],
    include: {
      account: { select: { name: true } },
      category: { select: { name: true } },
      payee: { select: { name: true } },
      statusLookup: { select: { name: true } },
    },
  })

  // --- bucket by day ------------------------------------------------------
  const dailyMap = new Map<string, CalendarTransaction[]>()

  for (const tx of transactions) {
    const key = utcDateKey(tx.date)
    if (!dailyMap.has(key)) dailyMap.set(key, [])

    const statusRaw = tx.statusLookup?.name ?? "PENDING"
    // "Pago" pelo critério único do sistema (src/lib/paid-status.ts) — antes,
    // "Quitado"/"Realizado" viravam PENDENTE aqui e pago nos insights.
    const status = isPaidStatusName(statusRaw)
      ? "PAID"
      : (STATUS_MAP[statusRaw.trim().toUpperCase()] ?? "PENDING")

    dailyMap.get(key)!.push({
      id: tx.id,
      description: tx.description,
      note: tx.note,
      amount: tx.amount,
      type: tx.type as CalendarTransaction["type"],
      status,
      category: { name: tx.category?.name ?? "" },
      account: { name: tx.account?.name ?? "" },
      payee: tx.payee ? { name: tx.payee.name } : null,
    })
  }

  // --- generate all days in range -----------------------------------------
  const days: CalendarDayStatement[] = []
  let running = openingBalance

  const cursor = new Date(from)
  cursor.setUTCHours(12, 0, 0, 0)
  const end = new Date(to)
  end.setUTCHours(12, 0, 0, 0)

  while (cursor <= end) {
    const key = utcDateKey(cursor)
    const txs = dailyMap.get(key) ?? []

    const income = txs
      .filter((t) => t.type === "INCOME")
      .reduce((s, t) => s + t.amount, 0)
    const expense = txs
      .filter((t) => t.type !== "INCOME")
      .reduce((s, t) => s + Math.abs(t.amount), 0)
    const net = txs.reduce((s, t) => s + t.amount, 0)

    const dayOpening = running
    running += net

    days.push({
      date: key,
      openingBalance: dayOpening,
      closingBalance: running,
      income,
      expense,
      net,
      transactions: txs,
    })

    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return { days, openingBalance }
}
