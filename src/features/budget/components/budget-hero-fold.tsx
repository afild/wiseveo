"use client"

import { useTranslations } from "next-intl"
import { Shield, AlertTriangle, Flame } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PeriodBar } from "./period-bar"
import { MonthStrip } from "./month-strip"
import { getZoneKey, type ZoneKey } from "@/features/budget/lib/zones"
import { computeClientPacing, getMonthPosition } from "@/features/budget/lib/period-bar-calc"
import { formatPercentValue } from "@/lib/monetary"
import { useMonetaryFormattingSafe } from "@/hooks/use-monetary-formatting"

interface BudgetHeroFoldProps {
  totalLimit: number
  totalSpent: number
  totalPaid: number
  totalScheduled: number
  totalProjected: number
  overallPct: number
}

const ZONE_STYLES: Record<ZoneKey, { text: string; bg: string; border: string }> = {
  safe: { text: "text-positive", bg: "bg-positive/15", border: "border-positive/30" },
  warning: { text: "text-warning", bg: "bg-warning/15", border: "border-warning/30" },
  danger: { text: "text-destructive", bg: "bg-destructive/15", border: "border-destructive/30" },
}

function ZoneIcon({ zone }: { zone: ZoneKey }) {
  if (zone === "safe") return <Shield className="h-3 w-3" />
  if (zone === "warning") return <AlertTriangle className="h-3 w-3" />
  return <Flame className="h-3 w-3" />
}

/**
 * Fold principal do orçamento: número herói (disponível/estourado), chip de zona
 * com codificação quádrupla (cor + ícone + palavra + número), narrativa de ritmo,
 * Period Bar e Month Strip alinhados, e a decomposição em mono.
 */
export function BudgetHeroFold({
  totalLimit,
  totalSpent,
  totalPaid,
  totalScheduled,
  totalProjected,
  overallPct,
}: BudgetHeroFoldProps) {
  const t = useTranslations("budget")
  const monetary = useMonetaryFormattingSafe()

  const { dayOfMonth, daysInMonth } = getMonthPosition()

  const remaining = totalLimit - totalSpent
  const isOver = remaining < 0

  const zoneKey = getZoneKey(overallPct)
  const zone = ZONE_STYLES[zoneKey]

  const pacing = computeClientPacing(overallPct, dayOfMonth, daysInMonth, totalPaid, totalLimit)
  const pacingText =
    pacing.projectedOverrunDay != null
      ? t("hero.pacingWillRunOut", { day: pacing.projectedOverrunDay })
      : pacing.pacing > 1.1
        ? t("hero.pacingFast")
        : t("hero.pacingOnTrack")

  return (
    <Card
      className="h-full"
      style={{
        background:
          "linear-gradient(to top, color-mix(in oklch, var(--primary) 5%, transparent), var(--card))",
      }}
    >
      <CardHeader className="pb-2">
        <CardDescription>{t("overview.periodSummary")}</CardDescription>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="font-display text-3xl font-extrabold tabular-nums">
              {monetary.formatMonetaryValue(Math.abs(remaining))}
            </CardTitle>
            <p className={`text-sm mt-0.5 ${isOver ? "text-destructive" : "text-muted-foreground"}`}>
              {isOver ? t("hero.aboveBudget") : t("hero.available")}
            </p>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <Badge variant="outline" className={`text-xs ${zone.bg} ${zone.text} ${zone.border}`}>
              <ZoneIcon zone={zoneKey} />
              <span className="ml-1">{t(`zones.${zoneKey}`)}</span>
              <span className="ml-1.5 tabular-nums">{formatPercentValue(overallPct, 0)}</span>
            </Badge>
            <span className="text-xs text-muted-foreground">{pacingText}</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2 pt-0">
        <PeriodBar
          paidAmt={totalPaid}
          scheduledAmt={totalScheduled}
          projectedAmt={totalProjected}
          limit={totalLimit}
          dayOfMonth={dayOfMonth}
          daysInMonth={daysInMonth}
          ariaLabel={t("hero.periodBarLabel")}
        />

        <MonthStrip
          dayOfMonth={dayOfMonth}
          daysInMonth={daysInMonth}
          overallPct={overallPct}
          ariaLabel={t("hero.monthStripLabel")}
        />

        <p className="font-mono text-xs text-muted-foreground pt-1">
          {t("hero.decomposition", {
            paid: monetary.formatMonetaryValue(totalPaid),
            scheduled: monetary.formatMonetaryValue(totalScheduled),
            projected: monetary.formatMonetaryValue(totalProjected),
          })}
        </p>
      </CardContent>
    </Card>
  )
}
