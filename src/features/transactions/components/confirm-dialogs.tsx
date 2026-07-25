"use client"

import { useTranslations } from "next-intl"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useMonetaryFormattingSafe } from "@/hooks/use-monetary-formatting"
import type { SerializedTransaction } from "../types"

interface DeleteConfirmDialogProps {
  transaction: SerializedTransaction | null
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
}

export function DeleteConfirmDialog({
  transaction,
  onConfirm,
  onCancel,
  loading,
}: DeleteConfirmDialogProps) {
  const monetary = useMonetaryFormattingSafe()
  const t = useTranslations("transactions.dialogs.deleteConfirm")
  const tCommon = useTranslations("common")

  return (
    <AlertDialog open={!!transaction} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("confirmText")}
            {transaction?.note && (
              <span className="mt-1 block font-medium text-foreground">
                {transaction.note}
              </span>
            )}
            {transaction && (
              <span className="mt-0.5 block text-sm">
                {monetary.formatMonetaryValue(transaction.amount)}
              </span>
            )}
            <span className="mt-2 block">
              {t("undoNote")}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? t("deleting") : tCommon("delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface QuickPayConfirmDialogProps {
  transaction: SerializedTransaction | null
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
}

export function QuickPayConfirmDialog({
  transaction,
  onConfirm,
  onCancel,
  loading,
}: QuickPayConfirmDialogProps) {
  const monetary = useMonetaryFormattingSafe()
  const t = useTranslations("transactions.dialogs.quickPayConfirm")
  const tCommon = useTranslations("common")

  return (
    <AlertDialog open={!!transaction} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("confirmText")}
            {transaction?.note && (
              <span className="mt-1 block font-medium text-foreground">
                {transaction.note}
              </span>
            )}
            {transaction && (
              <span className="mt-0.5 block text-sm">
                {monetary.formatMonetaryValue(transaction.amount)}
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={loading}>
            {loading ? t("processing") : t("confirmButton")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface MakeRecurringConfirmDialogProps {
  transaction: SerializedTransaction | null
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
}

export function MakeRecurringConfirmDialog({
  transaction,
  onConfirm,
  onCancel,
  loading,
}: MakeRecurringConfirmDialogProps) {
  const monetary = useMonetaryFormattingSafe()
  const t = useTranslations("transactions.dialogs.makeRecurringConfirm")
  const tCommon = useTranslations("common")

  return (
    <AlertDialog open={!!transaction} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("confirmText")}
            {transaction?.note && (
              <span className="mt-1 block font-medium text-foreground">
                {transaction.note}
              </span>
            )}
            {transaction && (
              <span className="mt-0.5 block text-sm">
                {monetary.formatMonetaryValue(transaction.amount)}
              </span>
            )}
            <span className="mt-2 block">
              {t("note")}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={loading}>
            {loading ? t("creating") : t("confirmButton")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
