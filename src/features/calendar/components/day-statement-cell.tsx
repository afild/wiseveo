"use client"

import { useTranslations } from "next-intl"
import { useMonetaryFormattingSafe } from "@/hooks/use-monetary-formatting"
import { cn } from "@/lib/utils"
import type { CalendarDayStatement } from "../types"

function amountColor(amount: number, type: string): string {
  if (type === "INCOME") return "text-positive"
  if (type === "TRANSFER") return "text-info"
  return "text-destructive"
}

interface DayStatementCellProps {
  day: CalendarDayStatement | undefined
  dayNumber: number
  isCurrentMonth: boolean
  isToday: boolean
  isSelected: boolean
  onClick: () => void
}

const MAX_VISIBLE = 3

export function DayStatementCell({
  day,
  dayNumber,
  isCurrentMonth,
  isToday,
  isSelected,
  onClick,
}: DayStatementCellProps) {
  const t = useTranslations("calendar")
  const monetary = useMonetaryFormattingSafe()
  const hasTx = day && day.transactions.length > 0
  const overflow = hasTx ? day.transactions.length - MAX_VISIBLE : 0

  return (
    <div
      className={cn(
        "min-h-[120px] border-r border-b last:border-r-0 p-1.5 cursor-pointer transition-colors",
        isCurrentMonth
          ? "bg-background hover:bg-accent/50"
          : "bg-muted/30 text-muted-foreground",
        isSelected && "ring-2 ring-primary ring-inset",
        isToday && "bg-accent/20",
      )}
      onClick={onClick}
    >
      {/* Day number */}
      <div className="flex items-center justify-between mb-0.5">
        <span
          className={cn(
            "text-sm font-medium",
            isToday &&
              "bg-primary text-primary-foreground rounded-md w-6 h-6 flex items-center justify-center text-xs",
          )}
        >
          {dayNumber}
        </span>
        {overflow > 0 && (
          <span className="text-[9px] text-muted-foreground">
            +{overflow}
          </span>
        )}
      </div>

      {hasTx && (
        <div className="space-y-px">
          {/* Opening balance */}
          <div className="flex justify-between text-[10px] font-semibold">
            <span className="truncate">{t("balance.opening")}</span>
            <span
              className={cn(
                day.openingBalance < 0 && "text-destructive",
              )}
            >
              {monetary.formatMonetaryValue(day.openingBalance)}
            </span>
          </div>

          {/* Transactions (max 3) */}
          {day.transactions.slice(0, MAX_VISIBLE).map((tx) => (
            <div
              key={tx.id}
              className={cn(
                "flex justify-between text-[10px]",
                amountColor(tx.amount, tx.type),
              )}
            >
              <span className="truncate mr-1">
                {tx.note || tx.description || tx.category.name}
              </span>
              <span className="whitespace-nowrap shrink-0">
                {monetary.formatMonetaryValue(tx.amount)}
              </span>
            </div>
          ))}

          {/* Closing balance */}
          <div className="flex justify-between text-[10px] font-semibold">
            <span className="truncate">{t("balance.closing")}</span>
            <span
              className={cn(
                day.closingBalance < 0 && "text-destructive",
              )}
            >
              {monetary.formatMonetaryValue(day.closingBalance)}
            </span>
          </div>
        </div>
      )}

      {/* Day without transactions but with balance */}
      {!hasTx && day && isCurrentMonth && (
        <div className="text-[10px] text-muted-foreground mt-1">
          <span>{monetary.formatMonetaryValue(day.openingBalance)}</span>
        </div>
      )}
    </div>
  )
}
