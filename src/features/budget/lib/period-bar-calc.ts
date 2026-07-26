/** Constante visual: 72% da largura da barra = zona de limite; 28% = zona de overflow. */
export const LIMIT_RATIO = 72

export interface SegmentWidths {
  paidPct: number
  scheduledPct: number
  projectedPct: number
  overflowPct: number
}

/**
 * Larguras dos segmentos da Period Bar, em % da largura total.
 * Projeção nunca soma ao realizado — só ocupa o espaço restante.
 */
export function calcSegments(
  paidAmt: number,
  scheduledAmt: number,
  projectedAmt: number,
  limit: number,
): SegmentWidths {
  if (limit <= 0) return { paidPct: 0, scheduledPct: 0, projectedPct: 0, overflowPct: 0 }

  const unit = LIMIT_RATIO / limit

  const paidPct = Math.min(paidAmt * unit, LIMIT_RATIO)
  const remainingAfterPaid = LIMIT_RATIO - paidPct
  const scheduledPct = Math.min(scheduledAmt * unit, remainingAfterPaid)
  const remainingAfterSched = remainingAfterPaid - scheduledPct
  const projectedPct = Math.min(projectedAmt * unit, remainingAfterSched)

  const totalSpentRatio = (paidAmt + scheduledAmt) * unit
  const overflowPct = Math.max(0, totalSpentRatio - LIMIT_RATIO)

  return { paidPct, scheduledPct, projectedPct, overflowPct }
}

/**
 * Posição no mês em UTC. UTC (e não hora local) porque o mesmo componente
 * renderiza no servidor e no cliente: fusos diferentes dariam dias diferentes e
 * quebrariam a hidratação. Também é o que `computeBudgetPacing` já usa.
 */
export function getMonthPosition(now = new Date()): {
  dayOfMonth: number
  daysInMonth: number
} {
  return {
    dayOfMonth: now.getUTCDate(),
    daysInMonth: new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
    ).getUTCDate(),
  }
}

export interface ClientPacingResult {
  monthPct: number
  pacing: number
  projectedOverrunDay: number | null
  zone: "good" | "warning" | "critical"
}

/** Ritmo de consumo do orçamento — versão client-side de computeBudgetPacing. */
export function computeClientPacing(
  overallPct: number,
  dayOfMonth: number,
  daysInMonth: number,
  totalPaid: number,
  totalLimit: number,
): ClientPacingResult {
  const monthPct = daysInMonth > 0 ? (dayOfMonth / daysInMonth) * 100 : 0
  const pacing = monthPct > 0 ? overallPct / monthPct : 0

  let projectedOverrunDay: number | null = null
  if (pacing > 1 && dayOfMonth > 0 && totalPaid > 0 && totalLimit > 0) {
    const dailyRate = totalPaid / dayOfMonth
    const overrunDay = Math.ceil(totalLimit / dailyRate)
    projectedOverrunDay = overrunDay <= daysInMonth ? overrunDay : null
  }

  const zone: ClientPacingResult["zone"] =
    pacing <= 1 ? "good" : pacing <= 1.2 || overallPct < 40 ? "warning" : "critical"

  return { monthPct, pacing, projectedOverrunDay, zone }
}
