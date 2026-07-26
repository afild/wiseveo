import { prisma } from "@/lib/prisma"
import { subMonths, startOfMonth, endOfMonth } from "date-fns"
import type { HistoryData } from "../types"

export interface BatchHistories {
  byGroup: Map<number, HistoryData>
  byCategory: Map<string, HistoryData>
  income: number[] // receita global por mês (mais recente primeiro)
  monthLabels: string[]
  targetMonth: string
}

/**
 * Busca de uma vez o histórico mensal de TODOS os grupos e categorias do
 * usuário na janela [referenceDate - months, referenceDate), mês da referência
 * excluído. Substitui as chamadas por card (N+1) de getBudgetHistory.
 */
export async function getBudgetHistoryBatch(
  userId: string,
  referenceDate: Date,
  months: number
): Promise<BatchHistories> {
  const startDate = startOfMonth(subMonths(referenceDate, months))
  const endDate = endOfMonth(subMonths(referenceDate, 1))

  const [expenseRows, incomeRows] = await Promise.all([
    prisma.$queryRawUnsafe<
      { m: number; y: number; g: number; c: string; total: number }[]
    >(
      // i18n-ignore: SQL bruto
      `SELECT EXTRACT(MONTH FROM "DATA")::int AS m,
              EXTRACT(YEAR FROM "DATA")::int AS y,
              "COD_GRU" AS g, "COD_CAT" AS c,
              COALESCE(SUM(ABS("VALOR")), 0)::float AS total
       FROM transactions
       WHERE user_id = $1 AND "TIPO" = 'EXPENSE' AND "DATA" >= $2 AND "DATA" <= $3
       GROUP BY y, m, g, c ORDER BY y DESC, m DESC`,
      userId, startDate, endDate
    ),
    prisma.$queryRawUnsafe<{ m: number; y: number; total: number }[]>(
      // i18n-ignore: SQL bruto
      `SELECT EXTRACT(MONTH FROM "DATA")::int AS m,
              EXTRACT(YEAR FROM "DATA")::int AS y,
              COALESCE(SUM(ABS("VALOR")), 0)::float AS total
       FROM transactions
       WHERE user_id = $1 AND "TIPO" = 'INCOME' AND "DATA" >= $2 AND "DATA" <= $3
       GROUP BY y, m ORDER BY y DESC, m DESC`,
      userId, startDate, endDate
    ),
  ])

  const monthLabels: string[] = []
  const slots: { m: number; y: number }[] = []
  for (let i = 1; i <= months; i++) {
    const t = subMonths(referenceDate, i)
    slots.push({ m: t.getMonth() + 1, y: t.getFullYear() })
    monthLabels.push(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`)
  }
  const targetMonth = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, "0")}`

  const income = slots.map((s) => incomeRows.find((r) => r.m === s.m && r.y === s.y)?.total ?? 0)

  const byGroup = new Map<number, HistoryData>()
  const byCategory = new Map<string, HistoryData>()
  const ensure = <K,>(map: Map<K, HistoryData>, key: K): HistoryData => {
    let h = map.get(key)
    if (!h) {
      h = { monthlySpent: Array(months).fill(0), monthlyIncome: [...income], monthLabels, targetMonth }
      map.set(key, h)
    }
    return h
  }
  for (const row of expenseRows) {
    const idx = slots.findIndex((s) => s.m === row.m && s.y === row.y)
    if (idx < 0) continue
    if (row.g != null) ensure(byGroup, row.g).monthlySpent[idx] += row.total
    if (row.c != null) ensure(byCategory, row.c).monthlySpent[idx] += row.total
  }
  return { byGroup, byCategory, income, monthLabels, targetMonth }
}
