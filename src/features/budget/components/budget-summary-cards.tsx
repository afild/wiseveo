"use client"

import { useTranslations } from "next-intl"
import {
  Target,
  ArrowDownCircle,
  PiggyBank,
  Gauge,
  Shield,
  AlertTriangle,
  Flame,
} from "lucide-react"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { SectionCardsGrid } from "@/components/section-cards-grid"
import { formatPercentValue } from "@/lib/monetary"
import { useMonetaryFormattingSafe } from "@/hooks/use-monetary-formatting"

function getZoneInfo(pct: number) {
  if (pct <= 50)
    return {
      color: "text-positive",
      bgColor: "bg-positive/15",
      borderColor: "border-positive/30",
      Icon: Shield,
      labelKey: "safe" as const,
    }
  if (pct <= 80)
    return {
      color: "text-warning",
      bgColor: "bg-warning/15",
      borderColor: "border-warning/30",
      Icon: AlertTriangle,
      labelKey: "warning" as const,
    }
  return {
    color: "text-destructive",
    bgColor: "bg-destructive/15",
    borderColor: "border-destructive/30",
    Icon: Flame,
    labelKey: "danger" as const,
  }
}

interface BudgetSummaryCardsProps {
  totalLimit: number
  totalSpent: number
  totalPaid: number
  totalScheduled: number
  overallPct: number
  itemCount: number
}

export function BudgetSummaryCards({
  totalLimit,
  totalSpent,
  totalPaid,
  totalScheduled,
  overallPct,
  itemCount,
}: BudgetSummaryCardsProps) {
  const t = useTranslations("budget")
  const monetary = useMonetaryFormattingSafe()
  const remaining = totalLimit - totalSpent
  const zone = getZoneInfo(overallPct)
  const remainingColor = remaining >= 0 ? "text-positive" : "text-destructive"
  const remainingLabel =
    remaining >= 0
      ? t("summary.marginAvailableLower")
      : t("summary.limitExceededLower")

  return (
    <SectionCardsGrid>
      {/* Card 1: Orçado Total */}
      <Card className="@container/card" style={{ background: "linear-gradient(to top, color-mix(in oklch, var(--primary) 5%, transparent), var(--card))" }}>
        <CardHeader>
          <CardDescription className="flex items-center gap-1.5">
            <Target className="size-3.5" />
            {t("summary.budgetedTotal")}
          </CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl font-display">
            {monetary.formatMonetaryValue(totalLimit)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              {t("summary.itemCount", { count: itemCount })}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="font-medium">{t("summary.limitForMonth")}</div>
          <div className="text-muted-foreground">{t("summary.sumOfBudgets")}</div>
        </CardFooter>
      </Card>

      {/* Card 2: Gasto Total */}
      <Card className="@container/card" style={{ background: "linear-gradient(to top, color-mix(in oklch, var(--primary) 5%, transparent), var(--card))" }}>
        <CardHeader>
          <CardDescription className="flex items-center gap-1.5">
            <ArrowDownCircle className="size-3.5" />
            {t("summary.spentTotal")}
          </CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl font-display text-destructive">
            {monetary.formatMonetaryValue(totalSpent)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              {formatPercentValue(overallPct)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="font-medium">{t("summary.periodExpenses")}</div>
          <div className="text-muted-foreground text-xs">
            {t("summary.paidScheduled", {
              paid: monetary.formatMonetaryValue(totalPaid),
              scheduled: monetary.formatMonetaryValue(totalScheduled),
            })}
          </div>
        </CardFooter>
      </Card>

      {/* Card 3: Restante */}
      <Card className="@container/card" style={{ background: "linear-gradient(to top, color-mix(in oklch, var(--primary) 5%, transparent), var(--card))" }}>
        <CardHeader>
          <CardDescription className="flex items-center gap-1.5">
            <PiggyBank className="size-3.5" />
            {remaining >= 0 ? t("status.remaining") : t("status.exceeded")}
          </CardDescription>
          <CardTitle
            className={`text-2xl font-semibold tabular-nums @[250px]/card:text-3xl font-display ${remainingColor}`}
          >
            {monetary.formatMonetaryValue(remaining)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              {formatPercentValue(100 - overallPct, 1, true)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="font-medium">
            {remaining >= 0 ? t("summary.marginAvailable") : t("summary.aboveBudget")}
          </div>
          <div className="text-muted-foreground">{remainingLabel}</div>
        </CardFooter>
      </Card>

      {/* Card 4: Utilização */}
      <Card className="@container/card" style={{ background: "linear-gradient(to top, color-mix(in oklch, var(--primary) 5%, transparent), var(--card))" }}>
        <CardHeader>
          <CardDescription className="flex items-center gap-1.5">
            <Gauge className="size-3.5" />
            {t("summary.usage")}
          </CardDescription>
          <CardTitle
            className={`text-2xl font-semibold tabular-nums @[250px]/card:text-3xl font-display ${zone.color}`}
          >
            {formatPercentValue(overallPct)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className={`${zone.bgColor} ${zone.color} ${zone.borderColor}`}>
              <zone.Icon className="size-3" />
              <span className="ml-1">{t(`zones.${zone.labelKey}`)}</span>
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="font-medium">{t(`zones.${zone.labelKey}Title`)}</div>
          <div className="text-muted-foreground">{t(`zones.${zone.labelKey}Footer`)}</div>
        </CardFooter>
      </Card>
    </SectionCardsGrid>
  )
}
