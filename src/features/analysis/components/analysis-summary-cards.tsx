"use client"

import {
  ArrowDownCircle,
  ArrowUpCircle,
  BadgePercent,
  Wallet,
} from "lucide-react"
import { useTranslations } from "next-intl"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { SectionCardsGrid } from "@/components/section-cards-grid"
import { useMonetaryFormattingSafe } from "@/hooks/use-monetary-formatting"
import { formatPercentValue } from "@/lib/monetary"
import { cn } from "@/lib/utils"
import type { DreData } from "../types"

interface AnalysisSummaryCardsProps {
  data: DreData | null
  loading: boolean
}

function resolveResultLabelKey(net: number): "positive" | "negative" | "balanced" {
  if (net > 0) return "positive"
  if (net < 0) return "negative"
  return "balanced"
}

export function AnalysisSummaryCards({
  data,
  loading,
}: AnalysisSummaryCardsProps) {
  const t = useTranslations("analysis")
  const tCommon = useTranslations("common")
  const monetary = useMonetaryFormattingSafe()
  const summary = data?.summary
  const resultLabel = t(`resultLabel.${resolveResultLabelKey(summary?.net ?? 0)}`)

  const cards = [
    {
      label: t("summary.income"),
      icon: ArrowUpCircle,
      value: loading
        ? "..."
        : monetary.formatMonetaryValue(summary?.income ?? 0),
      actionLabel: loading
        ? tCommon("loading")
        : t("groupsCount", { count: summary?.incomeGroupCount ?? 0 }),
      footerText: t("summary.incomeFooter"),
      valueClassName: "text-positive",
    },
    {
      label: t("summary.expense"),
      icon: ArrowDownCircle,
      value: loading
        ? "..."
        : monetary.formatAbsoluteMonetaryValue(summary?.expense ?? 0),
      actionLabel: loading
        ? tCommon("loading")
        : t("groupsCount", { count: summary?.expenseGroupCount ?? 0 }),
      footerText: t("summary.expenseFooter"),
      valueClassName: "text-destructive",
    },
    {
      label: t("summary.finalBalance"),
      icon: Wallet,
      value: loading
        ? "..."
        : monetary.formatMonetaryValue(summary?.net ?? 0),
      actionLabel: loading ? tCommon("loading") : resultLabel,
      footerText: t("summary.finalBalanceFooter"),
      valueClassName:
        (summary?.net ?? 0) < 0 ? "text-destructive" : "text-positive",
    },
    {
      label: t("summary.margin"),
      icon: BadgePercent,
      value: loading
        ? "..."
        : summary?.marginPercentage == null
          ? t("notAvailable")
          : formatPercentValue(summary.marginPercentage, 1),
      actionLabel: loading
        ? tCommon("loading")
        : t("summary.transactionsAbbrev", { count: summary?.transactionCount ?? 0 }),
      footerText: t("summary.marginFooter"),
      valueClassName:
        summary?.marginPercentage != null && summary.marginPercentage < 0
          ? "text-destructive"
          : "text-foreground",
    },
  ]

  return (
    <SectionCardsGrid>
      {cards.map((card) => {
        const Icon = card.icon

        return (
          <Card key={card.label} className="@container/card">
            <CardHeader>
              <CardDescription className="flex items-center gap-2">
                <Icon className="size-4" />
                <span>{card.label}</span>
              </CardDescription>
              <CardTitle
                className={cn(
                  "text-2xl font-semibold tabular-nums @[250px]/card:text-3xl font-display",
                  card.valueClassName,
                )}
              >
                {card.value}
              </CardTitle>
              <CardAction>
                <Badge variant="outline">{card.actionLabel}</Badge>
              </CardAction>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-1.5 text-sm">
              <div className="line-clamp-2 font-medium">{card.footerText}</div>
              <div className="text-muted-foreground">
                {loading ? t("summary.updating") : t("summary.statusFooter")}
              </div>
            </CardFooter>
          </Card>
        )
      })}
    </SectionCardsGrid>
  )
}
