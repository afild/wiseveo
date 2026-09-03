"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { format, endOfMonth } from "date-fns"
import { useLocale, useTranslations } from "next-intl"
import { usePathname } from "next/navigation"
import { toast } from "sonner"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useDateRange } from "@/contexts/date-range-context"
import { useMonetaryFormattingSafe } from "@/hooks/use-monetary-formatting"
import { formatAppDate } from "@/i18n/format"
import { useDateClosingGuard } from "@/features/security/components/date-closing-guard"
import {
  DateClosingSwitch,
  useDateClosingLabel,
} from "@/features/security/components/date-closing-switch"
import {
  summarizeBatch,
  type BatchRowResult,
} from "@/features/security/lib/batch-loops"
import type { AccountWithBalance } from "@/features/accounts/types"
import type { FinancialSummary } from "@/features/shared/services/get-financial-summary"

import type {
  SerializedTransaction,
  TransactionFilterOptions,
  TransactionFormOptions,
} from "../types"
import { useTransactionForm } from "../hooks/use-transaction-form"
import {
  createTransactionGlobalFilter,
  getTransactionColumns,
  type TransactionColumnLabels,
} from "./columns"
import { useDeviceClass } from "@/hooks/use-device-class"
import { DataTable } from "./data-table"
import { NewTransactionDialog } from "./new-transaction-dialog"
import { BalanceSummaryCards } from "./balance-summary-cards"
import {
  DeleteConfirmDialog,
  QuickPayConfirmDialog,
  MakeRecurringConfirmDialog,
} from "./confirm-dialogs"
import { AttachmentDialog } from "./attachment-dialog"
import { TransactionMessagesDialog } from "./transaction-messages-dialog"

interface TransactionsClientProps {
  initialTransactions: SerializedTransaction[]
  initialFilterOptions: TransactionFilterOptions
  formOptions: TransactionFormOptions
  initialBalancesAtDate: AccountWithBalance[]
  initialBalancesAtEndOfMonth: AccountWithBalance[]
  initialSummary: FinancialSummary
}

export function TransactionsClient({
  initialTransactions,
  initialFilterOptions,
  formOptions,
  initialBalancesAtDate,
  initialBalancesAtEndOfMonth,
  initialSummary,
}: TransactionsClientProps) {
  const monetary = useMonetaryFormattingSafe()
  const t = useTranslations("transactions")
  // Raiz do next-intl: os helpers de rótulo do plano de contas usam a chave completa.
  const tRoot = useTranslations()
  const locale = useLocale()
  const { dateRange, setDateRange } = useDateRange()
  // Texto de estado do fechamento; o switch em si mora no CardAction do mesmo cabeçalho.
  const closingLabel = useDateClosingLabel()
  const guard = useDateClosingGuard()
  const pathname = usePathname()
  const [transactions, setTransactions] = useState(initialTransactions)
  const [filterOptions, setFilterOptions] = useState(initialFilterOptions)
  const [balancesAtDate, setBalancesAtDate] = useState(initialBalancesAtDate)
  const [balancesAtEndOfMonth, setBalancesAtEndOfMonth] = useState(
    initialBalancesAtEndOfMonth,
  )
  const [summary, setSummary] = useState(initialSummary)
  const [loading, setLoading] = useState(false)
  const latestRequestRef = useRef(0)

  const fetchTransactions = useCallback(async (from: Date, to: Date) => {
    const requestId = ++latestRequestRef.current
    setLoading(true)
    try {
      const params = new URLSearchParams({
        from: format(from, "yyyy-MM-dd"),
        to: format(to, "yyyy-MM-dd"),
      })
      const res = await fetch(`/api/transactions?${params}`, { cache: "no-store" })
      if (!res.ok) throw new Error(t("toasts.syncError"))
      const data = await res.json()
      if (requestId !== latestRequestRef.current) return
      setTransactions(data.transactions)
      setFilterOptions(data.filterOptions)
      setBalancesAtDate(data.balancesAtDate)
      setBalancesAtEndOfMonth(data.balancesAtEndOfMonth)
      setSummary(data.summary)
    } catch (error) {
      if (requestId !== latestRequestRef.current) return
      console.error("Failed to fetch transactions:", error)
      toast.error(t("toasts.syncError"))
    } finally {
      if (requestId !== latestRequestRef.current) return
      setLoading(false)
    }
  }, [t])

  const form = useTransactionForm({
    formOptions,
    onSuccess: () => fetchTransactions(dateRange.from, dateRange.to),
  })

  // --- Action states ---
  const [txToDelete, setTxToDelete] = useState<SerializedTransaction | null>(null)
  const [txToPay, setTxToPay] = useState<SerializedTransaction | null>(null)
  const [txToRecur, setTxToRecur] = useState<SerializedTransaction | null>(null)
  const [txForAttachments, setTxForAttachments] = useState<SerializedTransaction | null>(null)
  const [txForMessages, setTxForMessages] = useState<SerializedTransaction | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [batchLoading, setBatchLoading] = useState(false)

  const refetch = useCallback(
    () => fetchTransactions(dateRange.from, dateRange.to),
    [dateRange.from, dateRange.to, fetchTransactions]
  )

  const handleDeleteConfirm = useCallback(async () => {
    if (!txToDelete) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/transactions/${txToDelete.id}/exclude`, {
        method: "POST",
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || t("toasts.deleteError"))
        return
      }
      toast.success(t("toasts.deleteSuccess"))
      setTxToDelete(null)
      refetch()
    } catch {
      toast.error(t("toasts.deleteError"))
    } finally {
      setActionLoading(false)
    }
  }, [txToDelete, refetch, t])

  const handleQuickPayConfirm = useCallback(async () => {
    if (!txToPay) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/transactions/${txToPay.id}/quick-pay`, {
        method: "POST",
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || t("toasts.quickPayError"))
        return
      }
      toast.success(t("toasts.quickPaySuccess"))
      setTxToPay(null)
      refetch()
    } catch {
      toast.error(t("toasts.quickPayError"))
    } finally {
      setActionLoading(false)
    }
  }, [txToPay, refetch, t])

  const handleMakeRecurringConfirm = useCallback(async () => {
    if (!txToRecur) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/transactions/${txToRecur.id}/recurrent`, {
        method: "POST",
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || t("toasts.recurringError"))
        return
      }
      toast.success(t("toasts.recurringSuccess"))
      setTxToRecur(null)
    } catch {
      toast.error(t("toasts.recurringError"))
    } finally {
      setActionLoading(false)
    }
  }, [txToRecur, t])

  const handleEditTransaction = useCallback((tx: SerializedTransaction) => {
    try {
      form.openEditDialog(tx)
      toast.success(t("toasts.editOpened"))
    } catch {
      toast.error(t("toasts.editOpenError"))
    }
  }, [form, t])

  const handleCopyTransaction = useCallback((tx: SerializedTransaction) => {
    try {
      form.openCopyDialog(tx)
      toast.success(t("toasts.copyOpened"))
    } catch {
      toast.error(t("toasts.copyOpenError"))
    }
  }, [form, t])

  const handleOpenAttachments = useCallback((tx: SerializedTransaction) => {
    try {
      setTxForAttachments(tx)
      toast.success(t("toasts.attachmentsOpened"))
    } catch {
      toast.error(t("toasts.attachmentsOpenError"))
    }
  }, [t])

  const handleNotes = useCallback((tx: SerializedTransaction) => {
    setTxForMessages(tx)
  }, [])

  const handleMessageCountChange = useCallback((transactionId: string, count: number) => {
    setTransactions((prev) => prev.map((tx) => {
      if (tx.id !== transactionId) return tx
      if (tx.messageCount === count) return tx
      return { ...tx, messageCount: count }
    }))

    setTxForMessages((prev) => {
      if (!prev || prev.id !== transactionId) return prev
      if (prev.messageCount === count) return prev
      return { ...prev, messageCount: count }
    })
  }, [])

  const handleBatchQuickPay = useCallback(async (
    items: SerializedTransaction[]
  ): Promise<boolean> => {
    if (items.length === 0) return true

    setBatchLoading(true)
    try {
      // Um PIN para o lote inteiro: a primeira resposta vale para as linhas seguintes (com token
      // elas repetem sozinhas; recusada, passam direto sem a janela abrir de novo).
      guard.beginBatch()
      const results: BatchRowResult[] = []

      for (const transaction of items) {
        try {
          const response = await fetch(`/api/transactions/${transaction.id}/quick-pay`, {
            method: "POST",
          })
          if (response.status === 423) {
            results.push("closed")
            continue
          }
          if (!response.ok) {
            results.push("failed")
            continue
          }
          results.push("succeeded")
        } catch {
          results.push("failed")
        }
      }

      const { succeeded, failed, closed, keepDialogOpen } = summarizeBatch(results)
      if (succeeded > 0 && failed === 0) {
        toast.success(t("toasts.batchQuickPaySuccess", { count: succeeded }))
      } else if (succeeded > 0) {
        toast.warning(t("toasts.batchQuickPayPartial", { succeeded, failed }))
      } else if (failed > 0) {
        toast.error(t("toasts.batchQuickPayError"))
      }
      if (closed > 0) {
        toast.warning(t("toasts.batchClosed", { count: closed }))
      }

      await refetch()
      return !keepDialogOpen
    } finally {
      guard.endBatch()
      setBatchLoading(false)
    }
  }, [guard, refetch, t])

  const handleBatchEditDate = useCallback(async (
    items: SerializedTransaction[],
    date: string
  ): Promise<boolean> => {
    if (items.length === 0) return true

    setBatchLoading(true)
    try {
      guard.beginBatch()
      const results: BatchRowResult[] = []

      for (const transaction of items) {
        try {
          const response = await fetch(`/api/transactions/${transaction.id}/date`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date }),
          })
          if (response.status === 423) {
            results.push("closed")
            continue
          }
          if (!response.ok) {
            results.push("failed")
            continue
          }
          results.push("succeeded")
        } catch {
          results.push("failed")
        }
      }

      const { succeeded, failed, closed, keepDialogOpen } = summarizeBatch(results)
      if (succeeded > 0 && failed === 0) {
        toast.success(t("toasts.batchEditDateSuccess", { count: succeeded }))
      } else if (succeeded > 0) {
        toast.warning(t("toasts.batchPartialUpdated", { succeeded, failed }))
      } else if (failed > 0) {
        toast.error(t("toasts.batchEditDateError"))
      }
      if (closed > 0) {
        toast.warning(t("toasts.batchClosed", { count: closed }))
      }

      await refetch()
      return !keepDialogOpen
    } finally {
      guard.endBatch()
      setBatchLoading(false)
    }
  }, [guard, refetch, t])

  const handleBatchEditPeriod = useCallback(async (
    items: SerializedTransaction[],
    period: string
  ): Promise<boolean> => {
    if (items.length === 0) return true

    setBatchLoading(true)
    try {
      guard.beginBatch()
      const results: BatchRowResult[] = []

      for (const transaction of items) {
        try {
          const response = await fetch(`/api/transactions/${transaction.id}/period`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ period }),
          })
          if (response.status === 423) {
            results.push("closed")
            continue
          }
          if (!response.ok) {
            results.push("failed")
            continue
          }
          results.push("succeeded")
        } catch {
          results.push("failed")
        }
      }

      const { succeeded, failed, closed, keepDialogOpen } = summarizeBatch(results)
      if (succeeded > 0 && failed === 0) {
        toast.success(t("toasts.batchEditPeriodSuccess", { count: succeeded }))
      } else if (succeeded > 0) {
        toast.warning(t("toasts.batchPartialUpdated", { succeeded, failed }))
      } else if (failed > 0) {
        toast.error(t("toasts.batchEditPeriodError"))
      }
      if (closed > 0) {
        toast.warning(t("toasts.batchClosed", { count: closed }))
      }

      await refetch()
      return !keepDialogOpen
    } finally {
      guard.endBatch()
      setBatchLoading(false)
    }
  }, [guard, refetch, t])

  const handleBatchCopyTransactions = useCallback(async (
    items: SerializedTransaction[],
    date: string
  ): Promise<boolean> => {
    if (items.length === 0) return true

    setBatchLoading(true)
    try {
      guard.beginBatch()
      const results: BatchRowResult[] = []

      for (const transaction of items) {
        try {
          const response = await fetch(`/api/transactions/${transaction.id}/copy`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date }),
          })
          if (response.status === 423) {
            results.push("closed")
            continue
          }
          if (!response.ok) {
            results.push("failed")
            continue
          }
          results.push("succeeded")
        } catch {
          results.push("failed")
        }
      }

      const { succeeded, failed, closed, keepDialogOpen } = summarizeBatch(results)
      if (succeeded > 0 && failed === 0) {
        toast.success(t("toasts.batchCopySuccess", { count: succeeded }))
      } else if (succeeded > 0) {
        toast.warning(t("toasts.batchCopyPartial", { succeeded, failed }))
      } else if (failed > 0) {
        toast.error(t("toasts.batchCopyError"))
      }
      if (closed > 0) {
        toast.warning(t("toasts.batchClosed", { count: closed }))
      }

      await refetch()
      return !keepDialogOpen
    } finally {
      guard.endBatch()
      setBatchLoading(false)
    }
  }, [guard, refetch, t])

  const handleBatchMakeRecurring = useCallback(async (
    items: SerializedTransaction[]
  ): Promise<boolean> => {
    if (items.length === 0) return true

    setBatchLoading(true)
    try {
      let succeeded = 0
      let failed = 0

      for (const transaction of items) {
        try {
          const response = await fetch(`/api/transactions/${transaction.id}/recurrent`, {
            method: "POST",
          })
          if (!response.ok) {
            failed += 1
            continue
          }
          succeeded += 1
        } catch {
          failed += 1
        }
      }

      if (failed === 0) {
        toast.success(t("toasts.batchMakeRecurringSuccess", { count: succeeded }))
      } else if (succeeded > 0) {
        toast.warning(t("toasts.batchMakeRecurringPartial", { succeeded, failed }))
      } else {
        toast.error(t("toasts.batchMakeRecurringError"))
      }

      return true
    } finally {
      setBatchLoading(false)
    }
  }, [t])

  const handleBatchNotes = useCallback(async (
    items: SerializedTransaction[]
  ): Promise<boolean> => {
    if (items.length === 0) return true
    toast.error(t("toasts.batchNotesInDevelopment"))
    return true
  }, [t])

  const handleBatchDelete = useCallback(async (
    items: SerializedTransaction[]
  ): Promise<boolean> => {
    if (items.length === 0) return true

    setBatchLoading(true)
    try {
      guard.beginBatch()
      const results: BatchRowResult[] = []

      for (const transaction of items) {
        try {
          const response = await fetch(`/api/transactions/${transaction.id}/exclude`, {
            method: "POST",
          })
          if (response.status === 423) {
            results.push("closed")
            continue
          }
          if (!response.ok) {
            results.push("failed")
            continue
          }
          results.push("succeeded")
        } catch {
          results.push("failed")
        }
      }

      const { succeeded, failed, closed, keepDialogOpen } = summarizeBatch(results)
      if (succeeded > 0 && failed === 0) {
        toast.success(t("toasts.batchDeleteSuccess", { count: succeeded }))
      } else if (succeeded > 0) {
        toast.warning(t("toasts.batchDeletePartial", { succeeded, failed }))
      } else if (failed > 0) {
        toast.error(t("toasts.batchDeleteError"))
      }
      if (closed > 0) {
        toast.warning(t("toasts.batchClosed", { count: closed }))
      }

      await refetch()
      return !keepDialogOpen
    } finally {
      guard.endBatch()
      setBatchLoading(false)
    }
  }, [guard, refetch, t])

  useEffect(() => {
    if (pathname !== "/transactions") return
    fetchTransactions(dateRange.from, dateRange.to)
  }, [pathname, dateRange.from, dateRange.to, fetchTransactions])

  const handleAddTransaction = useCallback(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const from = new Date(dateRange.from)
    from.setHours(0, 0, 0, 0)

    const to = new Date(dateRange.to)
    to.setHours(23, 59, 59, 999)

    let defaultDateStr: string | undefined = undefined

    if (today < from || today > to) {
      defaultDateStr = format(dateRange.from, "yyyy-MM-dd")
    }

    form.openDialog(defaultDateStr)
  }, [dateRange, form])

  const dateLabel = useMemo(
    () => formatAppDate(dateRange.to, t("formats.shortDate"), locale),
    [dateRange.to, t, locale],
  )

  const endOfMonthLabel = useMemo(
    () => formatAppDate(endOfMonth(dateRange.to), t("formats.shortDate"), locale),
    [dateRange.to, t, locale],
  )

  const sortingScopeKey = useMemo(
    () => `${format(dateRange.from, "yyyy-MM-dd")}|${format(dateRange.to, "yyyy-MM-dd")}`,
    [dateRange.from, dateRange.to],
  )

  const { isMobile } = useDeviceClass()
  const columnLabels: TransactionColumnLabels = useMemo(() => ({
    num: t("columns.num"),
    period: t("columns.period"),
    date: t("columns.date"),
    reference: t("columns.reference"),
    note: t("columns.note"),
    description: t("columns.description"),
    group: t("columns.group"),
    category: t("columns.category"),
    amount: t("columns.amount"),
    account: t("columns.account"),
    status: t("columns.status"),
    type: t("columns.type"),
    actions: t("columns.actions"),
    payee: t("columns.payee"),
    selectAllAria: t("columns.selectAllAria"),
    selectRowAria: t("columns.selectRowAria"),
    statusPaid: t("columns.statusPaid"),
    statusPending: t("columns.statusPending"),
    statusOverdue: t("columns.statusOverdue"),
    statusScheduled: t("columns.statusScheduled"),
    typeIncome: t("columns.typeIncome"),
    typeExpense: t("columns.typeExpense"),
    typeTransfer: t("columns.typeTransfer"),
  }), [t])
  const columns = useMemo(
    () => getTransactionColumns(monetary, isMobile, columnLabels, locale, tRoot),
    [monetary, isMobile, columnLabels, locale, tRoot],
  )
  const globalFilterFn = useMemo(
    () => createTransactionGlobalFilter(monetary, columnLabels, locale, tRoot),
    [monetary, columnLabels, locale, tRoot],
  )

  return (
    <>

      {/* Balance & Summary Cards */}
      <div className="px-4 lg:px-6">
        <BalanceSummaryCards
          balancesAtDate={balancesAtDate}
          balancesAtEndOfMonth={balancesAtEndOfMonth}
          summary={summary}
          dateLabel={dateLabel}
          endOfMonthLabel={endOfMonthLabel}
        />
      </div>

      {/* Data Table */}
      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("table.title")}</CardTitle>
            <CardDescription>
              {t("table.description", { count: transactions.length })}
              {closingLabel && <span className="mt-0.5 block">{closingLabel}</span>}
            </CardDescription>
            <DateClosingSwitch />
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              data={transactions}
              filterOptions={filterOptions}
              monetary={monetary}
              loading={loading}
              onAddTransaction={handleAddTransaction}
              onEditTransaction={handleEditTransaction}
              onCopyTransaction={handleCopyTransaction}
              onDeleteTransaction={setTxToDelete}
              onQuickPayTransaction={setTxToPay}
              onMakeRecurring={setTxToRecur}
              onOpenAttachments={handleOpenAttachments}
              onOpenNotes={handleNotes}
              onQuickPaySelectedTransactions={handleBatchQuickPay}
              onEditSelectedTransactionDate={handleBatchEditDate}
              onEditSelectedTransactionPeriod={handleBatchEditPeriod}
              onCopySelectedTransactions={handleBatchCopyTransactions}
              onMakeRecurringSelectedTransactions={handleBatchMakeRecurring}
              onNotesSelectedTransactions={handleBatchNotes}
              onDeleteSelectedTransactions={handleBatchDelete}
              batchLoading={batchLoading}
              globalFilterFn={globalFilterFn}
              sortingScopeKey={sortingScopeKey}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
            />
          </CardContent>
        </Card>
      </div>

      <NewTransactionDialog {...form} formOptions={formOptions} />

      {/* Action Dialogs */}
      <DeleteConfirmDialog
        transaction={txToDelete}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setTxToDelete(null)}
        loading={actionLoading}
      />
      <QuickPayConfirmDialog
        transaction={txToPay}
        onConfirm={handleQuickPayConfirm}
        onCancel={() => setTxToPay(null)}
        loading={actionLoading}
      />
      <MakeRecurringConfirmDialog
        transaction={txToRecur}
        onConfirm={handleMakeRecurringConfirm}
        onCancel={() => setTxToRecur(null)}
        loading={actionLoading}
      />
      <AttachmentDialog
        transaction={txForAttachments}
        onClose={() => setTxForAttachments(null)}
      />
      <TransactionMessagesDialog
        transaction={txForMessages}
        onClose={() => setTxForMessages(null)}
        onMessageCountChange={handleMessageCountChange}
      />
    </>
  )
}
