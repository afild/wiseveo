"use client"

import { useLocale, useTranslations } from "next-intl"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { createDateFormatter } from "@/i18n/format"
import type { SerializedTransaction } from "../types"
import { TransactionActions } from "./transaction-actions"
import { StatusDot } from "../../shared/components/status-dot"
import type { MonetaryFormatter } from "@/lib/monetary"

interface TransactionCardMobileProps {
  transaction: SerializedTransaction
  isSelected: boolean
  onToggleSelection: (value: boolean) => void
  monetary: Pick<MonetaryFormatter, "formatMonetaryValue">
  onEdit?: (tx: SerializedTransaction) => void
  onCopy?: (tx: SerializedTransaction) => void
  onDelete?: (tx: SerializedTransaction) => void
  onQuickPay?: (tx: SerializedTransaction) => void
  onMakeRecurring?: (tx: SerializedTransaction) => void
  onAttachments?: (tx: SerializedTransaction) => void
  onNotes?: (tx: SerializedTransaction) => void
}

export function TransactionCardMobile({
  transaction,
  isSelected,
  onToggleSelection,
  monetary,
  onEdit,
  onCopy,
  onDelete,
  onQuickPay,
  onMakeRecurring,
  onAttachments,
  onNotes,
}: TransactionCardMobileProps) {
  const t = useTranslations("transactions.card")
  const locale = useLocale()
  const amountColor = transaction.amount < 0 ? "text-destructive" : "text-positive"

  // Format date as dd/MM
  const dateStr = transaction.date
  const formattedDate = createDateFormatter(locale, {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(new Date(dateStr))

  return (
    <div 
      className={cn(
        "relative flex flex-col border-b p-3 transition-colors min-h-[105px]",
        isSelected ? "bg-muted/50" : "bg-card"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-1">
          <Checkbox
            checked={isSelected}
            onCheckedChange={(value) => onToggleSelection(!!value)}
            className="cursor-pointer"
          />
        </div>
        
        <div className="flex flex-1 flex-col min-w-0 pr-2">
          {/* Row 1: Date & Description (Secondary) & Amount */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] font-medium text-muted-foreground tabular-nums whitespace-nowrap">
                {formattedDate}
              </span>
              <span className="text-[13px] text-muted-foreground/80 truncate italic font-medium uppercase tracking-tight">
                {transaction.description || "—"}
              </span>
            </div>
            
            <div className="flex flex-col items-end gap-0.5 ml-auto">
              <span className={cn("text-sm font-bold tabular-nums", amountColor)}>
                {monetary.formatMonetaryValue(transaction.amount)}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase text-muted-foreground/50 max-w-[80px] truncate">
                  {transaction.account.name}
                </span>
                <StatusDot status={transaction.status as any} />
              </div>
            </div>
          </div>

          {/* Row 2: History/Note (Primary) */}
          <div className="-mt-1">
            <span className="text-[15px] font-bold text-foreground truncate block leading-tight">
              {transaction.note || "—"}
            </span>
          </div>

          {/* Row 3: Group > Category */}
          <div className="mt-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
            <span>{transaction.category.group.name}</span>
            <span className="opacity-50">{">"}</span>
            <span className="text-muted-foreground/70 font-medium normal-case tracking-normal text-[11px]">{transaction.category.name}</span>
          </div>

          {/* Row 4: Period & REF */}
          <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground/60 font-medium">
            {transaction.period && (
              <div className="flex items-center gap-1">
                <span className="uppercase font-bold text-[10px] opacity-70">{t("periodLabel")}</span>
                <span>{transaction.period}</span>
              </div>
            )}
            {transaction.reference && (
              <div className="flex items-center gap-1">
                <span className="uppercase font-bold text-[10px] opacity-70">{t("refLabel")}</span>
                <span className="truncate max-w-[120px]">{transaction.reference}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Actions (Kebab Menu) - Bottom Right */}
      <div className="absolute right-1 bottom-1">
        <TransactionActions
          transaction={transaction}
          onEdit={onEdit}
          onCopy={onCopy}
          onDelete={onDelete}
          onQuickPay={onQuickPay}
          onMakeRecurring={onMakeRecurring}
          onAttachments={onAttachments}
          onNotes={onNotes}
          triggerClassName="h-8 w-8"
        />
      </div>
    </div>
  )
}
