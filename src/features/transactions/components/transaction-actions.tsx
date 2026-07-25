"use client"

import { useTranslations } from "next-intl"
import {
  CheckCircle,
  Copy,
  Pencil,
  RotateCcw,
  Paperclip,
  MessageSquare,
  Trash2,
} from "lucide-react"
import {
  SmoothDropdown,
  type SmoothDropdownEntry,
} from "@/components/ui/smooth-dropdown"
import type { SerializedTransaction } from "../types"

interface TransactionActionsProps {
  transaction: SerializedTransaction
  onQuickPay?: (tx: SerializedTransaction) => void
  onEdit?: (tx: SerializedTransaction) => void
  onCopy?: (tx: SerializedTransaction) => void
  onMakeRecurring?: (tx: SerializedTransaction) => void
  onAttachments?: (tx: SerializedTransaction) => void
  onNotes?: (tx: SerializedTransaction) => void
  onDelete?: (tx: SerializedTransaction) => void
  triggerClassName?: string
}

export function TransactionActions({
  transaction,
  onQuickPay = () => {},
  onEdit = () => {},
  onCopy = () => {},
  onMakeRecurring = () => {},
  onAttachments = () => {},
  onNotes = () => {},
  onDelete = () => {},
  triggerClassName,
}: TransactionActionsProps) {
  const t = useTranslations("transactions.actions")

  const items: SmoothDropdownEntry[] = [
    {
      id: "quick-pay",
      label: t("quickPay"),
      icon: CheckCircle,
      iconClassName: "text-positive",
      onClick: () => onQuickPay(transaction),
    },
    {
      id: "edit",
      label: t("edit"),
      icon: Pencil,
      onClick: () => onEdit(transaction),
    },
    {
      id: "copy",
      label: t("copy"),
      icon: Copy,
      iconClassName: "text-blue-500",
      onClick: () => onCopy(transaction),
    },
    {
      id: "make-recurring",
      label: t("makeRecurring"),
      icon: RotateCcw,
      iconClassName: "text-info",
      onClick: () => onMakeRecurring(transaction),
    },
    {
      id: "attachments",
      label: t("attachments"),
      icon: Paperclip,
      badge: transaction.attachmentCount > 0 ? transaction.attachmentCount : undefined,
      badgeClassName: "bg-yellow-400 text-yellow-950",
      iconClassName: "text-warning",
      onClick: () => onAttachments(transaction),
    },
    {
      id: "notes",
      label: t("notes"),
      icon: MessageSquare,
      badge: transaction.messageCount > 0 ? transaction.messageCount : undefined,
      badgeClassName: "bg-primary text-primary-foreground",
      iconClassName: "text-primary",
      onClick: () => onNotes(transaction),
    },
    { id: "separator", separator: true },
    {
      id: "delete",
      label: t("delete"),
      icon: Trash2,
      variant: "destructive",
      onClick: () => onDelete(transaction),
    },
  ]

  return (
    <SmoothDropdown
      items={items}
      align="end"
      menuWidth={240}
      triggerClassName={triggerClassName}
      triggerBadges={[
        {
          id: "attachments",
          value: transaction.attachmentCount,
          className: "bg-yellow-400 text-yellow-950",
        },
        {
          id: "messages",
          value: transaction.messageCount,
          className: "bg-primary text-primary-foreground",
        },
      ]}
    />
  )
}
