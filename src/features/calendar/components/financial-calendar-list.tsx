"use client"

import { useLocale, useTranslations } from "next-intl"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { useMonetaryFormattingSafe } from "@/hooks/use-monetary-formatting"
import { createDateFormatter } from "@/i18n/format"
import { cn } from "@/lib/utils"
import type { CalendarDayStatement } from "../types"

const TYPE_COLORS: Record<string, string> = {
  INCOME: "text-positive",
  EXPENSE: "text-destructive",
  TRANSFER: "text-info",
}

interface FinancialCalendarListProps {
  days: CalendarDayStatement[]
  onSelectDate: (date: Date) => void
}

export function FinancialCalendarList({
  days,
  onSelectDate,
}: FinancialCalendarListProps) {
  const t = useTranslations("calendar")
  const locale = useLocale()
  const monetary = useMonetaryFormattingSafe()
  const dateFmt = createDateFormatter(locale, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  })
  const STATUS_LABELS: Record<string, string> = {
    PAID: t("statusLabels.paid"),
    PENDING: t("statusLabels.pending"),
    OVERDUE: t("statusLabels.overdue"),
    SCHEDULED: t("statusLabels.scheduled"),
  }
  const daysWithTx = days.filter((d) => d.transactions.length > 0)

  if (daysWithTx.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <p className="text-muted-foreground">
          {t("list.noTransactions")}
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 p-4 space-y-4 overflow-y-auto">
      {daysWithTx.map((day) => {
        const dateObj = new Date(day.date + "T12:00:00Z")

        return (
          <Card
            key={day.date}
            className="cursor-pointer hover:shadow-md transition-shadow bg-gradient-to-t from-primary/5 to-card shadow-xs dark:bg-card"
            onClick={() => onSelectDate(dateObj)}
          >
            <CardHeader className="pb-2">
              <CardDescription className="capitalize">
                {dateFmt.format(dateObj)}
              </CardDescription>
              <CardTitle className="flex items-center justify-between text-base">
                <span>
                  {t("list.transactionsCount", { count: day.transactions.length })}
                </span>
                <span
                  className={cn(
                    "tabular-nums",
                    day.net < 0 ? "text-destructive" : "text-positive",
                  )}
                >
                  {monetary.formatMonetaryValue(day.net)}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {/* Opening */}
              <div className="flex justify-between text-xs font-semibold tabular-nums pb-1 border-b">
                <span>{t("balance.opening")}</span>
                <span
                  className={cn(
                    day.openingBalance < 0 && "text-destructive",
                  )}
                >
                  {monetary.formatMonetaryValue(day.openingBalance)}
                </span>
              </div>

              {/* Transactions */}
              {day.transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm truncate">
                      {tx.note || tx.description || tx.category.name}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {STATUS_LABELS[tx.status] ?? tx.status}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "tabular-nums text-sm whitespace-nowrap shrink-0",
                      TYPE_COLORS[tx.type],
                    )}
                  >
                    {monetary.formatMonetaryValue(tx.amount)}
                  </span>
                </div>
              ))}

              {/* Closing */}
              <div className="flex justify-between text-xs font-semibold tabular-nums pt-1 border-t">
                <span>{t("balance.closing")}</span>
                <span
                  className={cn(
                    day.closingBalance < 0 && "text-destructive",
                  )}
                >
                  {monetary.formatMonetaryValue(day.closingBalance)}
                </span>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
