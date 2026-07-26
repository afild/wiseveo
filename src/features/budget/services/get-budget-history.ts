import { prisma } from "@/lib/prisma"
import { subMonths, startOfMonth, endOfMonth } from "date-fns"
import type { HistoryData } from "../types"
import { periodFromDate } from "@/lib/financial"

interface HistoryScope {
  type: "global" | "group" | "category"
  code?: number | string
}

/**
 * Fetch monthly spending/income history for N months before referenceDate.
 * Returns arrays ordered from most recent to oldest.
 */
export async function getBudgetHistory(
  userId: string,
  referenceDate: Date,
  months: number,
  scope: HistoryScope
): Promise<HistoryData> {
  const startDate = startOfMonth(subMonths(referenceDate, months))
  const endDate = endOfMonth(subMonths(referenceDate, 1)) // Exclude current month

  const startPeriod = periodFromDate(startDate)
  const endPeriod = periodFromDate(endDate)

  // Expense aggregation
  const expenseWhere: any = {
    userId,
    type: "EXPENSE",
    date: { gte: startDate, lte: endDate },
  }

  if (scope.type === "group" && scope.code !== undefined) {
    expenseWhere.groupCode = scope.code as number
  } else if (scope.type === "category" && scope.code !== undefined) {
    expenseWhere.categoryCode = scope.code as string
  }

  const expenseRows = await prisma.$queryRawUnsafe<
    { m: number; y: number; total: number }[]
  >(
    // i18n-ignore: string SQL bruta, não é texto de UI
    `SELECT EXTRACT(MONTH FROM "DATA")::int AS m,
            EXTRACT(YEAR FROM "DATA")::int AS y, 
            COALESCE(SUM(ABS("VALOR")), 0)::float AS total
     FROM transactions
     WHERE user_id = $1 AND "TIPO" = 'EXPENSE' AND "DATA" >= $2 AND "DATA" <= $3
     ${scope.type === "group" ? `AND "COD_GRU" = $4` : ""}
     ${scope.type === "category" ? `AND "COD_CAT" = $4` : ""}
     GROUP BY y, m ORDER BY y DESC, m DESC`,
    userId,
    startDate,
    endDate,
    ...(scope.type !== "global" && scope.code !== undefined ? [scope.code] : [])
  )

  // Income aggregation (global only for income_pct formula)
  const incomeRows = await prisma.$queryRawUnsafe<
    { m: number; y: number; total: number }[]
  >(
    // i18n-ignore: string SQL bruta, não é texto de UI
    `SELECT EXTRACT(MONTH FROM "DATA")::int AS m,
            EXTRACT(YEAR FROM "DATA")::int AS y,
            COALESCE(SUM(ABS("VALOR")), 0)::float AS total
     FROM transactions
     WHERE user_id = $1 AND "TIPO" = 'INCOME' AND "DATA" >= $2 AND "DATA" <= $3
     GROUP BY y, m ORDER BY y DESC, m DESC`,
    userId,
    startDate,
    endDate
  )

  // Build ordered month slots (most recent first)
  const monthlySpent: number[] = []
  const monthlyIncome: number[] = []
  const monthLabels: string[] = []

  for (let i = 1; i <= months; i++) {
    const target = subMonths(referenceDate, i)
    const tm = target.getMonth() + 1
    const ty = target.getFullYear()

    const expRow = expenseRows.find((r) => r.m === tm && r.y === ty)
    monthlySpent.push(expRow?.total ?? 0)

    const incRow = incomeRows.find((r) => r.m === tm && r.y === ty)
    monthlyIncome.push(incRow?.total ?? 0)

    monthLabels.push(`${ty}-${String(tm).padStart(2, "0")}`)
  }

  const targetMonth = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, "0")}`

  return { monthlySpent, monthlyIncome, monthLabels, targetMonth }
}
