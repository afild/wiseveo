interface MonthStripProps {
  dayOfMonth: number
  daysInMonth: number
  overallPct: number
  ariaLabel?: string
}

/** Faixa de células diárias alinhada sob a Period Bar: passado tonal, hoje marcado, futuro vazio. */
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
    <div role="img" aria-label={ariaLabel} className="flex gap-px w-full">
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
