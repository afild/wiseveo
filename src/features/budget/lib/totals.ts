import type { BudgetItem } from "../types"

export interface BudgetTotals {
  totalLimit: number
  totalSpent: number
  totalPaid: number
  totalScheduled: number
  totalProjected: number
  overallPct: number
}

/** Totais da página: somente cards marcados includeInTotals (grupos nativos). */
export function computeTotals(items: BudgetItem[]): BudgetTotals {
  const counted = items.filter((i) => i.includeInTotals)
  const totalLimit = counted.reduce((s, b) => s + b.limit, 0)
  const totalSpent = counted.reduce((s, b) => s + b.spent, 0)
  const totalPaid = counted.reduce((s, b) => s + b.paidAmount, 0)
  const totalScheduled = counted.reduce((s, b) => s + b.scheduledAmount, 0)
  const totalProjected = counted.reduce((s, b) => s + (b.projectedAmount ?? 0), 0)
  const overallPct = totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0
  return { totalLimit, totalSpent, totalPaid, totalScheduled, totalProjected, overallPct }
}
