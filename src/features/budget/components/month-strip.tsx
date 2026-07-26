import { LIMIT_RATIO } from "@/features/budget/lib/period-bar-calc"

interface MonthStripProps {
  dayOfMonth: number
  daysInMonth: number
  overallPct: number
  ariaLabel?: string
}

/**
 * Faixa de células diárias: passado tonal, hoje marcado, futuro vazio.
 * Ocupa só a zona de limite da Period Bar (LIMIT_RATIO) para que a posição do dia
 * caia sobre a marca de ritmo da barra — é o alinhamento que torna o ritmo legível.
 */
export function MonthStrip({
  dayOfMonth,
  daysInMonth,
  overallPct,
  ariaLabel,
}: MonthStripProps) {
  const pastColor =
    overallPct > 80
      ? "bg-destructive/60"
      : overallPct > 50
        ? "bg-warning/60"
        : "bg-positive/60"

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="flex gap-px"
      style={{ width: `${LIMIT_RATIO}%` }}
    >
      {Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1
        const cellColor =
          day < dayOfMonth ? pastColor : day === dayOfMonth ? "bg-foreground" : "bg-muted/30"
        return (
          <div
            key={day}
            className={`flex-1 h-1 rounded-full ${cellColor}`}
            aria-hidden="true"
          />
        )
      })}
    </div>
  )
}
