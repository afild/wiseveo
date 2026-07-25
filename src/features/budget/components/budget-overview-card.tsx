"use client"

import { useTranslations } from "next-intl"
import { Shield, AlertTriangle, Flame } from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { GradientDoughnut } from "./gradient-doughnut"
import { GradientProgressBar } from "./gradient-progress-bar"
import type { BudgetPageData } from "../types"
import { formatPercentValue } from "@/lib/monetary"

function getZoneInfo(pct: number) {
  if (pct <= 50)
    return {
      color: "text-positive",
      bgColor: "bg-positive/15",
      borderColor: "border-positive/30",
      icon: <Shield className="h-3.5 w-3.5" />,
      labelKey: "safe" as const,
    }
  if (pct <= 80)
    return {
      color: "text-warning",
      bgColor: "bg-warning/15",
      borderColor: "border-warning/30",
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      labelKey: "warning" as const,
    }
  return {
    color: "text-destructive",
    bgColor: "bg-destructive/15",
    borderColor: "border-destructive/30",
    icon: <Flame className="h-3.5 w-3.5" />,
    labelKey: "danger" as const,
  }
}

interface BudgetOverviewCardProps {
  data: Pick<BudgetPageData, "totalLimit" | "totalSpent" | "overallPct" | "items">
}

export function BudgetOverviewCard({ data }: BudgetOverviewCardProps) {
  const t = useTranslations("budget")
  const { overallPct, items } = data
  const zone = getZoneInfo(overallPct)

  return (
    <Card className="@container/card h-full" style={{ background: "linear-gradient(to top, color-mix(in oklch, var(--primary) 5%, transparent), var(--card))" }}>
      <CardHeader>
        <CardDescription>{t("overview.periodSummary")}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums">
          {t("overview.title")}
        </CardTitle>
        <CardAction>
          <Badge
            variant="outline"
            className={`${zone.bgColor} ${zone.color} ${zone.borderColor}`}
          >
            {zone.icon}
            <span className="ml-1">{t(`zones.${zone.labelKey}`)}</span>
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
          {/* Doughnut */}
          <GradientDoughnut pct={overallPct} size={160} />

          {/* Progress + count */}
          <div className="flex flex-1 flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <GradientProgressBar pct={overallPct} />
              <div className="flex justify-between">
                <span className={`text-sm font-semibold tabular-nums ${zone.color}`}>
                  {t("overview.used", { value: formatPercentValue(overallPct) })}
                </span>
                <span className="text-xs text-muted-foreground font-medium">
                  {t("overview.count", { count: items.length })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
