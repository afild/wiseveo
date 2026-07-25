"use client"

import {
  TrendingDown,
  TrendingUp,
  Wallet,
  ArrowUpCircle,
  ArrowDownCircle,
  PiggyBank,
} from "lucide-react"

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
import { formatPercentValue } from "@/lib/monetary"
import { useMonetaryFormattingSafe } from "@/hooks/use-monetary-formatting"
import { useTranslations } from "next-intl"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CardMetric {
  value: number
  change: number
}

export interface SectionCardsProps {
  balance: { total: number; change: number }
  income: CardMetric
  expense: CardMetric
  savings: CardMetric
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SectionCards({ balance, income, expense, savings }: SectionCardsProps) {
  const monetary = useMonetaryFormattingSafe()
  const t = useTranslations("dashboard.SectionCards")

  const cards = [
    {
      label: t("balance"),
      value: balance.total,
      change: balance.change,
      footerText: t("balanceFooter"),
      icon: Wallet,
      colorClass: balance.total >= 0 ? "text-positive" : "text-destructive",
      invertTrend: false,
    },
    {
      label: t("income"),
      value: income.value,
      change: income.change,
      footerText: t("incomeFooter"),
      icon: ArrowUpCircle,
      colorClass: "text-positive",
      invertTrend: false,
    },
    {
      label: t("expense"),
      value: expense.value,
      change: expense.change,
      footerText: t("expenseFooter"),
      icon: ArrowDownCircle,
      colorClass: "text-destructive",
      invertTrend: true,
    },
    {
      label: t("savings"),
      value: savings.value,
      change: savings.change,
      footerText: t("savingsFooter"),
      icon: PiggyBank,
      colorClass: savings.value >= 0 ? "text-positive" : "text-destructive",
      invertTrend: false,
    },
  ]

  return (
    <SectionCardsGrid>
      {cards.map((card) => {
        const isPositive = card.change >= 0
        const isGood = card.invertTrend ? !isPositive : isPositive
        const TrendIcon = isPositive ? TrendingUp : TrendingDown

        return (
          <Card key={card.label} className="@container/card">
            <CardHeader className="pb-2 md:pb-4">
              <CardDescription className="text-xs md:text-sm">{card.label}</CardDescription>
              <CardTitle
                className={`text-xl font-semibold tabular-nums @[250px]/card:text-3xl font-display ${card.colorClass} md:text-2xl`}
              >
                {monetary.formatMonetaryValue(card.value)}
              </CardTitle>
              <CardAction>
                <Badge variant="outline" className="text-xs">
                  <TrendIcon />
                  {formatPercentValue(card.change, 1, true)}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-1 pt-0 text-xs md:text-sm md:gap-1.5">
              <div className="line-clamp-1 flex gap-2 font-medium">
                {card.footerText}
                {isGood ? (
                  <TrendingUp className="size-3.5 md:size-4" />
                ) : (
                  <TrendingDown className="size-3.5 md:size-4" />
                )}
              </div>
              <div className="text-muted-foreground">{t("vsPreviousMonth")}</div>
            </CardFooter>
          </Card>
        )
      })}
    </SectionCardsGrid>
  )
}
