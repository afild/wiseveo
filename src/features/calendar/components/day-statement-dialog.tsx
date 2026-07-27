"use client"

import { useLocale, useTranslations } from "next-intl"
import { DetailPanel } from "@/components/detail-panel"
import { Badge } from "@/components/ui/badge"
import { useMonetaryFormattingSafe } from "@/hooks/use-monetary-formatting"
import { createDateFormatter } from "@/i18n/format"
import { resolveAccountLabel, resolveCategoryLabel } from "@/i18n/chart-labels"
import { cn } from "@/lib/utils"
import type { CalendarDayStatement } from "../types"

const STATUS_COLORS: Record<string, string> = {
  PAID: "bg-positive/15 text-positive border-positive/30",
  PENDING: "bg-warning/15 text-warning border-warning/30",
  OVERDUE: "bg-destructive/15 text-destructive border-destructive/30",
  SCHEDULED: "bg-info/15 text-info border-info/30",
}

const TYPE_COLORS: Record<string, string> = {
  INCOME: "text-positive",
  EXPENSE: "text-destructive",
  TRANSFER: "text-info",
}

interface DayStatementDialogProps {
  day: CalendarDayStatement | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSyncDay?: (date: string) => void
  hasGoogle?: boolean
}

export function DayStatementDialog({
  day,
  open,
  onOpenChange,
}: DayStatementDialogProps) {
  const t = useTranslations("calendar")
  // Raiz do next-intl: os helpers de rotulo do plano de contas usam a chave completa.
  const tRoot = useTranslations()
  const locale = useLocale()
  const monetary = useMonetaryFormattingSafe()
  const dateFmt = createDateFormatter(locale, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
  const STATUS_LABELS: Record<string, string> = {
    PAID: t("statusLabels.paid"),
    PENDING: t("statusLabels.pending"),
    OVERDUE: t("statusLabels.overdue"),
    SCHEDULED: t("statusLabels.scheduled"),
  }

  if (!day) return null

  const dateObj = new Date(day.date + "T12:00:00Z")

  return (
    <DetailPanel
      open={open}
      onOpenChange={onOpenChange}
      title={<span className="capitalize">{dateFmt.format(dateObj)}</span>}
      description={t("dayDetail.description")}
    >
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {t("dayDetail.description")}
        </p>

        {/* Opening balance */}
        <div className="flex justify-between items-center py-2 border-b">
          <span className="text-sm font-semibold">
            {t("balance.opening")}
          </span>
          <span
            className={cn(
              "text-sm font-bold",
              day.openingBalance < 0 && "text-destructive",
            )}
          >
            {monetary.formatMonetaryValue(day.openingBalance)}
          </span>
        </div>

        {/* Transactions */}
        {day.transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t("dayDetail.noMovement")}
          </p>
        ) : (
          <div className="space-y-2">
            {day.transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between gap-2 py-1.5 hover:bg-muted/50 rounded-md px-2 -mx-2"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {tx.note || tx.description || "—"}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground truncate">
                      {resolveCategoryLabel(tRoot, tx.category)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {resolveAccountLabel(tRoot, tx.account)}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] px-1.5 py-0",
                        STATUS_COLORS[tx.status],
                      )}
                    >
                      {STATUS_LABELS[tx.status] ?? tx.status}
                    </Badge>
                  </div>
                </div>
                <span
                  className={cn(
                    "text-sm font-medium whitespace-nowrap shrink-0",
                    TYPE_COLORS[tx.type],
                  )}
                >
                  {monetary.formatMonetaryValue(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Closing balance */}
        <div className="flex justify-between items-center py-2 border-t">
          <span className="text-sm font-semibold">{t("balance.closing")}</span>
          <span
            className={cn(
              "text-sm font-bold",
              day.closingBalance < 0 && "text-destructive",
            )}
          >
            {monetary.formatMonetaryValue(day.closingBalance)}
          </span>
        </div>

        {/* Summary */}
        {day.transactions.length > 0 && (
          <div className="grid grid-cols-3 gap-2 pt-2 border-t text-center">
            <div>
              <p className="text-xs text-muted-foreground">{t("summary.income")}</p>
              <p className="text-sm text-positive">
                {monetary.formatMonetaryValue(day.income)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("summary.expense")}</p>
              <p className="text-sm text-destructive">
                {monetary.formatMonetaryValue(day.expense)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("summary.net")}</p>
              <p
                className={cn(
                  "text-sm",
                  day.net < 0 ? "text-destructive" : "text-positive",
                )}
              >
                {monetary.formatMonetaryValue(day.net)}
              </p>
            </div>
          </div>
        )}
      </div>
    </DetailPanel>
  )
}
