"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import { Calendar, Tag, Wallet } from "lucide-react"

import { cn } from "@/lib/utils"
import { formatPeriod } from "@/lib/financial"
import { useMonetaryFormattingSafe } from "@/hooks/use-monetary-formatting"
import { createDateFormatter } from "@/i18n/format"
import type { SerializedRecurringTransaction } from "../types"
import { RecurringActions } from "./recurring-actions"

interface RecurringCardMobileProps {
  recurring: SerializedRecurringTransaction
  onLaunch?: (recurring: SerializedRecurringTransaction) => void
  onEdit?: (recurring: SerializedRecurringTransaction) => void
  onDelete?: (recurring: SerializedRecurringTransaction) => void
}

export function RecurringCardMobile({
  recurring,
  onLaunch,
  onEdit,
  onDelete,
}: RecurringCardMobileProps) {
  const monetary = useMonetaryFormattingSafe()
  const t = useTranslations("recurring.card")
  const locale = useLocale()

  const amountColorClass =
    recurring.type === "INCOME"
      ? "text-positive"
      : recurring.type === "EXPENSE"
        ? "text-destructive"
        : "text-muted-foreground"

  const formattedDate = recurring.lastDate
    ? createDateFormatter(locale, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(recurring.lastDate))
    : "—"

  const formattedPeriod =
    recurring.period.length === 6 ? formatPeriod(recurring.period) : "—"

  return (
    <div className="relative flex flex-col border-b bg-card p-4 transition-all min-h-[100px]">
      {/* Accent Strip */}
      <div
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          recurring.type === "INCOME" ? "bg-positive" : "bg-destructive"
        )}
      />

      <div className="flex flex-col gap-1.5">
        {/* Row 1: Description (Secondary) & Amount */}
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-1 text-[13px] text-muted-foreground/80 italic font-medium uppercase tracking-tight">
            {recurring.description || t("noDescription")}
          </p>
          <div className="flex flex-col items-end gap-0.5 ml-auto">
            <div className={cn("font-bold text-sm tabular-nums", amountColorClass)}>
              {monetary.formatMonetaryValue(recurring.amount)}
            </div>
            <span className="text-[11px] font-bold uppercase text-muted-foreground/50 max-w-[80px] truncate">
              {recurring.account.name}
            </span>
          </div>
        </div>

        {/* Row 2: History (Primary) */}
        <div className="-mt-1">
          <h3 className="line-clamp-1 font-bold text-[15px] text-foreground leading-tight">
            {recurring.note || t("noHistory")}
          </h3>
        </div>

        {/* Row 3: Group & Category */}
        <div className="mt-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
          <span>{recurring.category.group.name}</span>
          <span className="opacity-50">{">"}</span>
          <span className="text-muted-foreground/70 font-medium normal-case tracking-normal text-[11px]">{recurring.category.name}</span>
        </div>

        {/* Details Row: Last Date & Period */}
        <div className="mt-1 flex items-center gap-4 text-[11px] text-muted-foreground/60 font-medium">
          <div className="flex items-center gap-1">
            <Calendar className="size-3" />
            <span>{t("lastLabel")} {formattedDate}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-bold uppercase text-[10px] opacity-70">{t("periodLabel")}</span>
            <span>{formattedPeriod}</span>
          </div>
        </div>

        {/* Reference Section (Small) */}
        <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground/40 font-bold truncate pr-10">
          {recurring.reference || t("noReference")}
        </div>
      </div>

      {/* Actions (Kebab Menu) - Moved up into the body, absolute positioned */}
      <div className="absolute right-1 bottom-1">
        <RecurringActions
          recurring={recurring}
          onLaunch={onLaunch}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>
    </div>
  )
}
