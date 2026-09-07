"use client"

import { useTranslations } from "next-intl"
import { Calendar } from "@/components/ui/calendar"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useMonetaryFormattingSafe } from "@/hooks/use-monetary-formatting"
import { cn } from "@/lib/utils"
import type { CalendarDayStatement } from "../types"

interface FinancialCalendarSidebarProps {
  currentDate: Date
  selectedDate: Date | null
  onSelectDate: (date: Date) => void
  onMonthChange: (month: Date) => void
  days: CalendarDayStatement[]
  hasGoogle: boolean
  googleSlot?: React.ReactNode
}

export function FinancialCalendarSidebar({
  currentDate,
  selectedDate,
  onSelectDate,
  onMonthChange,
  days,
  googleSlot,
}: FinancialCalendarSidebarProps) {
  const t = useTranslations("calendar")
  const monetary = useMonetaryFormattingSafe()
  const totalIncome = days.reduce((s, d) => s + d.income, 0)
  const totalExpense = days.reduce((s, d) => s + d.expense, 0)
  const totalNet = days.reduce((s, d) => s + d.net, 0)
  const lastDay = days[days.length - 1]

  return (
    <div className="space-y-4">
      {/* Mini calendar */}
      <Calendar
        mode="single"
        selected={selectedDate ?? undefined}
        onSelect={(date) => date && onSelectDate(date)}
        month={currentDate}
        onMonthChange={onMonthChange}
        className="rounded-md border"
      />

      {/* Month summary */}
      <Card className="bg-gradient-to-t from-primary/5 to-card shadow-xs dark:bg-card">
        <CardHeader className="pb-2">
          <CardDescription>{t("sidebar.description")}</CardDescription>
          <CardTitle className="text-base">{t("sidebar.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("summary.income")}</span>
            <span className="text-positive">
              {monetary.formatMonetaryValue(totalIncome)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("summary.expense")}</span>
            <span className="text-destructive">
              {monetary.formatMonetaryValue(totalExpense)}
            </span>
          </div>
          <div className="flex justify-between text-sm border-t pt-2">
            <span className="font-medium">{t("summary.net")}</span>
            <span
              className={cn(
                "font-semibold",
                totalNet < 0 ? "text-destructive" : "text-positive",
              )}
            >
              {monetary.formatMonetaryValue(totalNet)}
            </span>
          </div>
          {lastDay && (
            <div className="flex justify-between text-sm border-t pt-2">
              <span className="text-muted-foreground">{t("balance.closing")}</span>
              <span
                className={cn(
                  "font-semibold",
                  lastDay.closingBalance < 0 && "text-destructive",
                )}
              >
                {monetary.formatMonetaryValue(lastDay.closingBalance)}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Google Calendar slot */}
      {googleSlot && <div>{googleSlot}</div>}
    </div>
  )
}
