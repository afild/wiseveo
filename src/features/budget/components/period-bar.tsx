"use client"

import { calcSegments, LIMIT_RATIO } from "@/features/budget/lib/period-bar-calc"

interface PeriodBarProps {
  paidAmt: number
  scheduledAmt: number
  projectedAmt: number
  limit: number
  dayOfMonth: number
  daysInMonth: number
  mini?: boolean
  ariaLabel?: string
}

/**
 * Anatomia: [PAID sólido] gap [SCHEDULED hachurado] gap [PROJECTED tracejado]
 * dentro dos primeiros 72% (zona de limite); os 28% finais são a faixa de overflow.
 * A projeção fica separada por lacuna e sem preenchimento sólido — nunca soma ao realizado.
 */
export function PeriodBar({
  paidAmt,
  scheduledAmt,
  projectedAmt,
  limit,
  dayOfMonth,
  daysInMonth,
  mini = false,
  ariaLabel,
}: PeriodBarProps) {
  const { paidPct, scheduledPct, projectedPct, overflowPct } = calcSegments(
    paidAmt,
    scheduledAmt,
    projectedAmt,
    limit,
  )

  const pacingPct = daysInMonth > 0 ? (dayOfMonth / daysInMonth) * LIMIT_RATIO : 0
  const height = mini ? "h-1.5" : "h-3"
  const radius = mini ? "rounded-full" : "rounded-sm"

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className={`relative w-full ${height} bg-muted/40 ${radius}`}
    >
      <div
        className="absolute inset-y-0 border-r border-foreground/20"
        style={{ left: `${LIMIT_RATIO}%` }}
        aria-hidden="true"
      />

      {paidPct > 0 && (
        <div
          className={`absolute inset-y-0 left-0 bg-primary ${radius}`}
          style={{ width: `calc(${paidPct}% - 1px)` }}
          aria-hidden="true"
        />
      )}

      {scheduledPct > 0 && (
        <div
          className={`absolute inset-y-0 ${radius}`}
          style={{
            left: `calc(${paidPct}% + 2px)`,
            width: `calc(${scheduledPct}% - 2px)`,
            background: `repeating-linear-gradient(45deg, color-mix(in oklch, var(--primary) 55%, transparent) 0px, color-mix(in oklch, var(--primary) 55%, transparent) 2px, transparent 2px, transparent 6px)`,
          }}
          aria-hidden="true"
        />
      )}

      {projectedPct > 0 && (
        <div
          className="absolute inset-y-0 border-2 border-dashed border-primary/50 rounded-sm"
          style={{
            left: `calc(${paidPct + scheduledPct}% + 4px)`,
            width: `calc(${projectedPct}% - 4px)`,
          }}
          aria-hidden="true"
        />
      )}

      {overflowPct > 0 && (
        <div
          className={`absolute inset-y-0 bg-destructive/70 ${radius}`}
          style={{
            left: `calc(${LIMIT_RATIO}% + 2px)`,
            width: `${Math.min(overflowPct, 100 - LIMIT_RATIO - 1)}%`,
          }}
          aria-hidden="true"
        />
      )}

      {!mini && pacingPct > 0 && (
        <div
          className="absolute -inset-y-0.5 w-0.5 bg-foreground/50 rounded-full"
          style={{ left: `${pacingPct}%` }}
          aria-hidden="true"
        />
      )}
    </div>
  )
}
