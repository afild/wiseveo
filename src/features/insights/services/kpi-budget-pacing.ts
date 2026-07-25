import { getBudgetData } from "@/features/budget/services/get-budget-data"
import type { BudgetPacingKpi } from "../types"

/**
 * Ritmo do orçamento do mês corrente: % consumido vs. % do mês decorrido.
 * Reutiliza getBudgetData para que os números batam exatamente com a página
 * de orçamento (fórmulas, cartões customizados etc.).
 */
export async function computeBudgetPacing(
  userId: string,
  now = new Date(),
): Promise<BudgetPacingKpi> {
  const data = await getBudgetData(userId)

  const empty: BudgetPacingKpi = {
    state: "empty",
    zone: "neutral",
    monthPct: 0,
    pacing: 0,
    projectedOverrunDay: null,
    totalLimit: 0,
    totalSpent: 0,
    usagePct: 0,
    worstItemName: null,
    worstItemPct: null,
  }

  if (data.items.length === 0 || data.totalLimit <= 0) return empty

  const dayOfMonth = now.getUTCDate()
  const daysInMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate()
  const monthPct = (dayOfMonth / daysInMonth) * 100
  const usagePct = data.overallPct
  const pacing = monthPct > 0 ? usagePct / monthPct : 0

  let projectedOverrunDay: number | null = null
  if (pacing > 1 && data.totalPaid > 0) {
    const dailyRate = data.totalPaid / dayOfMonth
    const overrunDay = Math.ceil(data.totalLimit / dailyRate)
    projectedOverrunDay = overrunDay <= daysInMonth ? overrunDay : null
  }

  let worstItemName: string | null = null
  let worstItemPct: number | null = null
  for (const item of data.items) {
    if (item.limit <= 0) continue
    const pct = (item.spent / item.limit) * 100
    if (worstItemPct === null || pct > worstItemPct) {
      worstItemPct = pct
      worstItemName = item.name
    }
  }

  // Início de mês distorce o ritmo (aluguel no dia 1 = pacing altíssimo);
  // só marcar crítico quando o consumo absoluto já é relevante.
  const zone =
    pacing <= 1
      ? "good"
      : pacing <= 1.2 || usagePct < 40
        ? "warning"
        : "critical"

  return {
    state: "ok",
    zone,
    monthPct,
    pacing,
    projectedOverrunDay,
    totalLimit: data.totalLimit,
    totalSpent: data.totalSpent,
    usagePct,
    worstItemName,
    worstItemPct,
  }
}
