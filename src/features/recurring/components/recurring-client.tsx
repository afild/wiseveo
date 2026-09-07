"use client"

import { useEffect, useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { ArrowRightLeft, TrendingDown, TrendingUp } from "lucide-react"
import { toast } from "sonner"

import { DataTable } from "./data-table"
import { getRecurringColumns, type RecurringColumnLabels } from "./columns"
import { Button } from "@/components/ui/button"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useMonetaryFormattingSafe } from "@/hooks/use-monetary-formatting"
import { useDateClosingGuard } from "@/features/security/components/date-closing-guard"
import { dayKeyOfLocal, isDayKey, storedPeriod } from "@/features/security/lib/date-closing"
import { isValidPeriod, periodFromDate } from "@/lib/financial"
import {
  summarizeBatch,
  type BatchRowResult,
} from "@/features/security/lib/batch-loops"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DetailPanel,
  DetailPanelCloseButton,
  DetailPanelSection,
} from "@/components/detail-panel"
import type {
  FormCategory,
  FormCategoryGroup,
  FormPayee,
  TransactionFormOptions,
} from "@/features/transactions/types"
import {
  resolveAccountLabel,
  resolveCategoryLabel,
  resolveGroupLabel,
  resolveStatusLabel,
} from "@/i18n/chart-labels"
import type {
  SerializedRecurringTransaction,
  RecurringFilterOptions,
} from "../types"

type TransactionType = "INCOME" | "EXPENSE" | "TRANSFER"

interface RecurringClientProps {
  initialRecurring: SerializedRecurringTransaction[]
  filterOptions: RecurringFilterOptions
  formOptions: TransactionFormOptions
}

interface EditFormState {
  date: string
  period: string
  note: string
  description: string
  reference: string
  amount: string
  type: TransactionType
  accountId: string
  groupCode: string
  categoryCode: string
  statusCode: string
  payeeId: string
}

function getTypeDotClass(type: TransactionType) {
  if (type === "INCOME") return "bg-positive"
  if (type === "EXPENSE") return "bg-destructive"
  return "bg-info"
}

function getTypeTextClass(type: TransactionType) {
  if (type === "INCOME") return "text-positive"
  if (type === "EXPENSE") return "text-destructive"
  return "text-info"
}

function getTypeAccentClass(type: TransactionType) {
  if (type === "INCOME") return "text-positive border-l-positive"
  if (type === "EXPENSE") return "text-destructive border-l-destructive"
  return "text-info border-l-info"
}

function getInitialEditForm(): EditFormState {
  return {
    date: dayKeyOfLocal(new Date()),
    period: periodFromDate(dayKeyOfLocal(new Date())),
    note: "",
    description: "",
    reference: "",
    amount: "",
    type: "EXPENSE",
    accountId: "",
    groupCode: "",
    categoryCode: "",
    statusCode: "",
    payeeId: "none",
  }
}

export function RecurringClient({
  initialRecurring,
  filterOptions,
  formOptions,
}: RecurringClientProps) {
  const monetary = useMonetaryFormattingSafe()
  const t = useTranslations("recurring")
  const tCommon = useTranslations("common")
  const guard = useDateClosingGuard()
  // Raiz do next-intl: os helpers de rotulo do plano de contas usam a chave completa.
  const tRoot = useTranslations()
  const locale = useLocale()
  const columnLabels: RecurringColumnLabels = useMemo(() => ({
    account: t("columns.account"),
    actions: t("columns.actions"),
    amount: t("columns.amount"),
    category: t("columns.category"),
    description: t("columns.description"),
    group: t("columns.group"),
    lastLaunch: t("columns.lastLaunch"),
    note: t("columns.note"),
    period: t("columns.period"),
    reference: t("columns.reference"),
    selectAllAria: t("columns.selectAllAria"),
    selectRowAria: t("columns.selectRowAria"),
    type: t("columns.type"),
    typeExpense: t("columns.typeExpense"),
    typeIncome: t("columns.typeIncome"),
    typeTransfer: t("columns.typeTransfer"),
  }), [t])
  const columns = useMemo(
    () => getRecurringColumns(monetary, columnLabels, locale, tRoot),
    [monetary, columnLabels, locale, tRoot],
  )
  const [recurringData, setRecurringData] = useState(initialRecurring)
  const [launchTarget, setLaunchTarget] =
    useState<SerializedRecurringTransaction | null>(null)
  const [deleteTarget, setDeleteTarget] =
    useState<SerializedRecurringTransaction | null>(null)
  const [editTarget, setEditTarget] =
    useState<SerializedRecurringTransaction | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [batchLoading, setBatchLoading] = useState(false)
  const [editForm, setEditForm] = useState<EditFormState>(getInitialEditForm)
  const [filteredGroups, setFilteredGroups] = useState<FormCategoryGroup[]>([])
  const [filteredCategories, setFilteredCategories] = useState<FormCategory[]>(
    []
  )
  const [payeeOptions, setPayeeOptions] = useState<FormPayee[]>(formOptions.payees)
  const [suggestions, setSuggestions] = useState<FormPayee[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  const closeEditDialog = () => {
    setEditTarget(null)
    setEditForm(getInitialEditForm())
    setFilteredGroups([])
    setFilteredCategories([])
    setSuggestions([])
    setShowSuggestions(false)
  }

  const openEditDialog = (recurring: SerializedRecurringTransaction) => {
    const groupsForType = formOptions.groups.filter((g) => g.type === recurring.type)
    const selectedGroup =
      groupsForType.find((g) => g.code === recurring.groupCode) ??
      groupsForType[0]
    const categoriesForGroup = selectedGroup
      ? formOptions.categories.filter((c) => c.groupId === selectedGroup.id)
      : []
    const selectedCategory =
      categoriesForGroup.find((c) => c.code === recurring.categoryCode) ??
      categoriesForGroup[0]

    const accountExists = formOptions.accounts.some(
      (account) => account.id === recurring.accountId
    )
    const statusExists = formOptions.statuses.some(
      (status) => status.code === recurring.statusCode
    )
    const payeeExists =
      recurring.payeeId === null
        ? true
        : payeeOptions.some((payee) => payee.id === recurring.payeeId)

    setFilteredGroups(groupsForType)
    setFilteredCategories(categoriesForGroup)
    // Linha antiga pode trazer competência ilegível (char(6) com lixo): cai no mês da data para a
    // validação do formulário não travar num valor que a pessoa nem vê.
    const seedDate = recurring.lastDate
      ? recurring.lastDate.slice(0, 10)
      : dayKeyOfLocal(new Date())
    setEditForm({
      date: seedDate,
      period: storedPeriod(recurring.period) ?? periodFromDate(seedDate),
      note: recurring.note ?? "",
      description: recurring.description ?? "",
      reference: recurring.reference ?? "",
      amount: String(Math.abs(recurring.amount)),
      type: recurring.type,
      accountId: accountExists
        ? String(recurring.accountId)
        : formOptions.accounts[0]
          ? String(formOptions.accounts[0].id)
          : "",
      groupCode: selectedGroup ? String(selectedGroup.code) : "",
      categoryCode: selectedCategory?.code ?? "",
      statusCode: statusExists
        ? String(recurring.statusCode)
        : formOptions.statuses[0]
          ? String(formOptions.statuses[0].code)
          : "",
      payeeId:
        recurring.payeeId === null || !payeeExists
          ? "none"
          : String(recurring.payeeId),
    })
    setSuggestions([])
    setShowSuggestions(false)
    setEditTarget(recurring)
  }

  useEffect(() => {
    if (!editTarget) return

    const groupsForType = formOptions.groups.filter(
      (group) => group.type === editForm.type
    )
    const selectedGroup =
      groupsForType.find(
        (group) => String(group.code) === editForm.groupCode
      ) ?? groupsForType[0]

    const categoriesForGroup = selectedGroup
      ? formOptions.categories.filter(
          (category) => category.groupId === selectedGroup.id
        )
      : []
    const selectedCategory =
      categoriesForGroup.find(
        (category) => category.code === editForm.categoryCode
      ) ?? categoriesForGroup[0]

    setFilteredGroups(groupsForType)
    setFilteredCategories(categoriesForGroup)

    const nextGroupCode = selectedGroup ? String(selectedGroup.code) : ""
    const nextCategoryCode = selectedCategory?.code ?? ""

    if (
      nextGroupCode !== editForm.groupCode ||
      nextCategoryCode !== editForm.categoryCode
    ) {
      setEditForm((prev) => ({
        ...prev,
        groupCode: nextGroupCode,
        categoryCode: nextCategoryCode,
      }))
    }
  }, [
    editTarget,
    editForm.type,
    editForm.groupCode,
    editForm.categoryCode,
    formOptions.groups,
    formOptions.categories,
  ])

  const handleLaunchConfirm = async () => {
    if (!launchTarget) return
    setActionLoading(true)
    try {
      const response = await fetch(
        `/api/recurring-transactions/${launchTarget.id}/launch`,
        { method: "POST" }
      )
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        toast.error(payload.error || t("toasts.launchError"))
        return
      }

      setRecurringData((prev) =>
        prev.map((item) =>
          item.id === launchTarget.id
            ? {
                ...item,
                lastDate: payload.recurring?.lastDate
                  ? String(payload.recurring.lastDate)
                  : payload.transaction?.date
                    ? String(payload.transaction.date)
                    : item.lastDate,
                period:
                  typeof payload.recurring?.period === "string"
                    ? payload.recurring.period
                    : item.period,
              }
            : item
        )
      )

      toast.success(t("toasts.launchSuccess"))
      setLaunchTarget(null)
    } catch {
      toast.error(t("toasts.launchError"))
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    setActionLoading(true)
    try {
      const response = await fetch(`/api/recurring-transactions/${deleteTarget.id}`, {
        method: "DELETE",
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        toast.error(payload.error || t("toasts.deleteError"))
        return
      }

      setRecurringData((prev) => prev.filter((item) => item.id !== deleteTarget.id))
      toast.success(t("toasts.deleteSuccess"))
      setDeleteTarget(null)
    } catch {
      toast.error(t("toasts.deleteError"))
    } finally {
      setActionLoading(false)
    }
  }

  // Competência fora do mês da data: a dica avisa que essa defasagem é mantida a cada lançamento.
  const periodDiverges =
    editForm.period.length === 6 &&
    isDayKey(editForm.date) &&
    editForm.period !== periodFromDate(editForm.date)

  const handleSaveEdit = async () => {
    if (!editTarget) return

    if (
      !editForm.date ||
      !editForm.amount ||
      !editForm.accountId ||
      !editForm.groupCode ||
      !editForm.categoryCode ||
      !editForm.statusCode
    ) {
      toast.error(t("toasts.requiredFields"))
      return
    }

    const parsedAmount = Number(editForm.amount.replace(",", "."))
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error(t("toasts.invalidAmount"))
      return
    }

    if (!isValidPeriod(editForm.period)) {
      toast.error(t("toasts.invalidPeriod"))
      return
    }

    const normalizedAmount =
      editForm.type === "EXPENSE"
        ? -Math.abs(parsedAmount)
        : Math.abs(parsedAmount)

    setActionLoading(true)
    try {
      const response = await fetch(`/api/recurring-transactions/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lastDate: editForm.date,
          period: editForm.period,
          note: editForm.note.trim() || null,
          description: editForm.description.trim() || null,
          reference: editForm.reference.trim() || null,
          amount: normalizedAmount,
          type: editForm.type,
          accountId: Number(editForm.accountId),
          groupCode: Number(editForm.groupCode),
          categoryCode: editForm.categoryCode,
          statusCode: Number(editForm.statusCode),
          payeeId: editForm.payeeId === "none" ? null : Number(editForm.payeeId),
          payeeName: editForm.note.trim() || null,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        toast.error(payload.error || t("toasts.editError"))
        return
      }

      const account = formOptions.accounts.find(
        (item) => String(item.id) === editForm.accountId
      )
      const category = formOptions.categories.find(
        (item) => item.code === editForm.categoryCode
      )
      const group = category
        ? formOptions.groups.find((item) => item.id === category.groupId)
        : undefined
      const status = formOptions.statuses.find(
        (item) => String(item.code) === editForm.statusCode
      )
      const resolvedPayeeId =
        typeof payload.payeeId === "number"
          ? payload.payeeId
          : editForm.payeeId === "none"
            ? null
            : Number(editForm.payeeId)
      const resolvedPayeeName =
        payload?.payee?.name ??
        (resolvedPayeeId && editForm.note.trim() ? editForm.note.trim() : null)

      if (
        resolvedPayeeId &&
        resolvedPayeeName &&
        !payeeOptions.some((item) => item.id === resolvedPayeeId)
      ) {
        setPayeeOptions((prev) => [
          ...prev,
          { id: resolvedPayeeId, name: resolvedPayeeName },
        ])
      }

      setRecurringData((prev) =>
        prev.map((item) =>
          item.id === editTarget.id
            ? {
                ...item,
                lastDate: payload.lastDate
                  ? String(payload.lastDate)
                  : `${editForm.date}T12:00:00.000Z`,
                period:
                  typeof payload.period === "string"
                    ? payload.period
                    : editForm.period,
                note: editForm.note.trim() || null,
                description: editForm.description.trim() || null,
                reference: editForm.reference.trim() || null,
                amount: normalizedAmount,
                type: editForm.type,
                accountId: Number(editForm.accountId),
                groupCode: Number(editForm.groupCode),
                categoryCode: editForm.categoryCode,
                statusCode: Number(editForm.statusCode),
                payeeId: resolvedPayeeId,
                account: {
                  id: String(editForm.accountId),
                  name: account?.name ?? item.account.name,
                },
                category: {
                  id: category?.id ?? item.category.id,
                  name: category?.name ?? item.category.name,
                  group: {
                    id: group?.id ?? item.category.group.id,
                    name: group?.name ?? item.category.group.name,
                  },
                },
                status: {
                  name: status?.name ?? item.status.name,
                },
                payee:
                  resolvedPayeeId && resolvedPayeeName
                    ? { id: String(resolvedPayeeId), name: resolvedPayeeName }
                  : null,
              }
            : item
        )
      )

      toast.success(t("toasts.editSuccess"))
      closeEditDialog()
    } catch {
      toast.error(t("toasts.editError"))
    } finally {
      setActionLoading(false)
    }
  }

  const handleBatchLaunch = async (
    items: SerializedRecurringTransaction[]
  ): Promise<boolean> => {
    if (items.length === 0) return true

    setBatchLoading(true)
    try {
      // Um PIN para o lote inteiro: a primeira resposta vale para as linhas seguintes (com token
      // elas repetem sozinhas; recusada, passam direto sem a janela abrir de novo).
      guard.beginBatch()
      const launched: Array<{ id: string; date: string; period: string | null }> = []
      const results: BatchRowResult[] = []

      for (const recurring of items) {
        try {
          const response = await fetch(
            `/api/recurring-transactions/${recurring.id}/launch`,
            { method: "POST" }
          )
          if (response.status === 423) {
            results.push("closed")
            continue
          }
          const payload = await response.json().catch(() => ({}))
          if (!response.ok) {
            results.push("failed")
            continue
          }
          const launchedDate =
            payload.recurring?.lastDate
              ? String(payload.recurring.lastDate)
              : payload.transaction?.date
                ? String(payload.transaction.date)
                : recurring.lastDate ?? new Date().toISOString()
          const launchedPeriod =
            typeof payload.recurring?.period === "string"
              ? payload.recurring.period
              : null
          launched.push({ id: recurring.id, date: launchedDate, period: launchedPeriod })
          results.push("succeeded")
        } catch {
          results.push("failed")
        }
      }

      if (launched.length > 0) {
        const launchedMap = new Map(
          launched.map((item) => [item.id, { date: item.date, period: item.period }])
        )
        setRecurringData((prev) =>
          prev.map((item) =>
            launchedMap.has(item.id)
              ? {
                  ...item,
                  lastDate: launchedMap.get(item.id)?.date ?? item.lastDate,
                  period: launchedMap.get(item.id)?.period ?? item.period,
                }
              : item
          )
        )
      }

      const { succeeded, failed, closed, keepDialogOpen } = summarizeBatch(results)
      if (succeeded > 0 && failed === 0) {
        toast.success(t("toasts.batchLaunchSuccess", { count: succeeded }))
      } else if (succeeded > 0) {
        toast.warning(t("toasts.batchLaunchPartial", { succeeded, failed }))
      } else if (failed > 0) {
        toast.error(t("toasts.batchLaunchError"))
      }
      if (closed > 0) {
        toast.warning(t("toasts.batchClosed", { count: closed }))
      }

      return !keepDialogOpen
    } finally {
      guard.endBatch()
      setBatchLoading(false)
    }
  }

  const handleBatchEditDate = async (
    items: SerializedRecurringTransaction[],
    date: string
  ): Promise<boolean> => {
    if (items.length === 0) return true

    setBatchLoading(true)
    try {
      const updatedRows: Array<{ id: string; lastDate: string; period: string | null }> = []
      let failed = 0

      for (const recurring of items) {
        try {
          const response = await fetch(`/api/recurring-transactions/${recurring.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lastDate: date }),
          })
          const payload = await response.json().catch(() => ({}))
          if (!response.ok) {
            failed += 1
            continue
          }
          updatedRows.push({
            id: recurring.id,
            lastDate: payload.lastDate
              ? String(payload.lastDate)
              : `${date}T12:00:00.000Z`,
            period:
              typeof payload.period === "string" ? payload.period : null,
          })
        } catch {
          failed += 1
        }
      }

      if (updatedRows.length > 0) {
        const updatedMap = new Map(
          updatedRows.map((item) => [
            item.id,
            { lastDate: item.lastDate, period: item.period },
          ])
        )
        setRecurringData((prev) =>
          prev.map((item) =>
            updatedMap.has(item.id)
              ? {
                  ...item,
                  lastDate: updatedMap.get(item.id)?.lastDate ?? item.lastDate,
                  period: updatedMap.get(item.id)?.period ?? item.period,
                }
              : item
          )
        )
      }

      if (failed === 0) {
        toast.success(t("toasts.batchEditDateSuccess", { count: updatedRows.length }))
      } else if (updatedRows.length > 0) {
        toast.warning(
          t("toasts.batchEditDatePartial", { succeeded: updatedRows.length, failed })
        )
      } else {
        toast.error(t("toasts.batchEditDateError"))
      }

      return true
    } finally {
      setBatchLoading(false)
    }
  }

  const handleBatchDelete = async (
    items: SerializedRecurringTransaction[]
  ): Promise<boolean> => {
    if (items.length === 0) return true

    setBatchLoading(true)
    try {
      const deletedIds: string[] = []
      let failed = 0

      for (const recurring of items) {
        try {
          const response = await fetch(`/api/recurring-transactions/${recurring.id}`, {
            method: "DELETE",
          })
          if (!response.ok) {
            failed += 1
            continue
          }
          deletedIds.push(recurring.id)
        } catch {
          failed += 1
        }
      }

      if (deletedIds.length > 0) {
        const deletedSet = new Set(deletedIds)
        setRecurringData((prev) =>
          prev.filter((item) => !deletedSet.has(item.id))
        )
      }

      if (failed === 0) {
        toast.success(t("toasts.batchDeleteSuccess", { count: deletedIds.length }))
      } else if (deletedIds.length > 0) {
        toast.warning(
          t("toasts.batchDeletePartial", { succeeded: deletedIds.length, failed })
        )
      } else {
        toast.error(t("toasts.batchDeleteError"))
      }

      return true
    } finally {
      setBatchLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-6 md:px-6">

      <DataTable
        columns={columns}
        data={recurringData}
        filterOptions={filterOptions}
        onLaunchRecurring={(recurring) => setLaunchTarget(recurring)}
        onEditRecurring={openEditDialog}
        onDeleteRecurring={(recurring) => setDeleteTarget(recurring)}
        onLaunchSelectedRecurring={handleBatchLaunch}
        onEditSelectedRecurringDate={handleBatchEditDate}
        onDeleteSelectedRecurring={handleBatchDelete}
        batchLoading={batchLoading}
      />

      <AlertDialog
        open={!!launchTarget}
        onOpenChange={(open) => !open && setLaunchTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("dialogs.launchConfirm.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("dialogs.launchConfirm.confirmText")}
              {launchTarget && (
                <span className="mt-2 block text-foreground">
                  {(launchTarget.note || t("dialogs.historyFallback"))} •{" "}
                  {monetary.formatMonetaryValue(launchTarget.amount)}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={actionLoading}
              onClick={() => void handleLaunchConfirm()}
            >
              {actionLoading
                ? t("dialogs.launchConfirm.launching")
                : t("dialogs.launchConfirm.launchButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DetailPanel
        open={!!editTarget}
        onOpenChange={(open) => !open && closeEditDialog()}
        title={
          <span className="flex items-center gap-2.5">
            <span className={`inline-block size-2 rounded-full ${getTypeDotClass(editForm.type)}`} />
            {t("dialogs.editRecurring.title")}
          </span>
        }
        description={t("dialogs.editRecurring.description")}
        footer={
          <>
            <DetailPanelCloseButton onClick={closeEditDialog}>
              {tCommon("cancel")}
            </DetailPanelCloseButton>
            <Button
              onClick={() => void handleSaveEdit()}
              disabled={actionLoading}
              className="flex-1 sm:flex-none cursor-pointer"
            >
              {actionLoading
                ? t("dialogs.editRecurring.saving")
                : t("dialogs.editRecurring.updateButton")}
            </Button>
          </>
        }
      >
        {/* Type Switcher */}
        <div className="flex gap-1 rounded-lg bg-muted p-1 mb-4">
          {(
            [
              { key: "INCOME", label: t("dialogs.editRecurring.typeIncome"), Icon: TrendingUp },
              { key: "EXPENSE", label: t("dialogs.editRecurring.typeExpense"), Icon: TrendingDown },
              { key: "TRANSFER", label: t("dialogs.editRecurring.typeTransfer"), Icon: ArrowRightLeft },
            ] as const
          ).map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() =>
                setEditForm((prev) => ({ ...prev, type: key }))
              }
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-all cursor-pointer ${
                editForm.type === key
                  ? `bg-background shadow-sm ${getTypeTextClass(key)}`
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[1fr_150px] gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                {t("dialogs.editRecurring.dateLabel")} <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={editForm.date}
                onChange={(event) => {
                  const value = event.target.value
                  setEditForm((prev) => {
                    // Mesma regra do formulário de lançamentos: a competência segue a data até a
                    // pessoa divergir de propósito; depois disso fica como está.
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { ...prev, date: value }
                    const prevDerived = periodFromDate(prev.date)
                    const shouldSyncPeriod = !prev.period || prev.period === prevDerived
                    return {
                      ...prev,
                      date: value,
                      period: shouldSyncPeriod ? periodFromDate(value) : prev.period,
                    }
                  })
                }}
                className="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                {t("dialogs.editRecurring.amountLabel")} <span className="text-destructive">*</span>
              </Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={editForm.amount}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, amount: event.target.value }))
                }
                className={`font-bold text-right border-l-4 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${getTypeAccentClass(
                  editForm.type
                )}`}
              />
            </div>
          </div>

          <div className="relative space-y-1.5">
            <div className="flex items-center gap-2">
              <Label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                {t("dialogs.editRecurring.historyLabel")}
              </Label>
              {showSuggestions && suggestions.length > 0 && (
                <span className="text-[10px] text-info font-medium">
                  {t("dialogs.editRecurring.suggestionsCount", { count: suggestions.length })}
                </span>
              )}
            </div>
            <Input
              value={editForm.note}
              onChange={(event) => {
                const value = event.target.value
                const normalized = value.trim().toLowerCase()
                const matches =
                  normalized.length > 0
                    ? payeeOptions
                        .filter((payee) =>
                          payee.name.toLowerCase().includes(normalized)
                        )
                        .slice(0, 5)
                    : []
                const exact = payeeOptions.find(
                  (payee) => payee.name.trim().toLowerCase() === normalized
                )

                setEditForm((prev) => ({
                  ...prev,
                  note: value,
                  payeeId: exact ? String(exact.id) : "none",
                }))
                setSuggestions(matches)
                setShowSuggestions(matches.length > 0)
              }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              autoComplete="off"
              placeholder={t("dialogs.editRecurring.historyPlaceholder")}
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute z-50 left-0 right-0 top-full mt-0.5 bg-popover border border-border rounded-md shadow-lg overflow-hidden max-h-36 overflow-y-auto">
                {suggestions.map((payee) => (
                  <li
                    key={payee.id}
                    onMouseDown={() => {
                      setEditForm((prev) => ({
                        ...prev,
                        note: payee.name,
                        payeeId: String(payee.id),
                      }))
                      setSuggestions([])
                      setShowSuggestions(false)
                    }}
                    className="px-3 py-2 text-xs cursor-pointer hover:bg-accent transition-colors border-b border-border/50 last:border-0"
                  >
                    {payee.name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Classificação: Grupo · Categoria · Banco · Status */}
          <DetailPanelSection title={tCommon("formSections.classification")}>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                  {t("dialogs.editRecurring.groupLabel")} <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={editForm.groupCode}
                  onValueChange={(value) =>
                    setEditForm((prev) => ({ ...prev, groupCode: value }))
                  }
                >
                  <SelectTrigger className="w-full cursor-pointer">
                    <SelectValue placeholder={t("dialogs.editRecurring.selectPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredGroups.map((group) => (
                      <SelectItem
                        key={group.id}
                        value={String(group.code)}
                        className="cursor-pointer"
                      >
                        {resolveGroupLabel(tRoot, group)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                  {t("dialogs.editRecurring.categoryLabel")} <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={editForm.categoryCode}
                  onValueChange={(value) =>
                    setEditForm((prev) => ({ ...prev, categoryCode: value }))
                  }
                  disabled={!editForm.groupCode}
                >
                  <SelectTrigger className="w-full cursor-pointer">
                    <SelectValue placeholder={t("dialogs.editRecurring.selectPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredCategories.map((category) => (
                      <SelectItem
                        key={category.id}
                        value={category.code}
                        className="cursor-pointer"
                      >
                        {resolveCategoryLabel(tRoot, category)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                  {t("dialogs.editRecurring.accountLabel")} <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={editForm.accountId}
                  onValueChange={(value) =>
                    setEditForm((prev) => ({ ...prev, accountId: value }))
                  }
                >
                  <SelectTrigger className="w-full cursor-pointer">
                    <SelectValue placeholder={t("dialogs.editRecurring.selectPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {formOptions.accounts.map((account) => (
                      <SelectItem
                        key={account.id}
                        value={String(account.id)}
                        className="cursor-pointer"
                      >
                        {resolveAccountLabel(tRoot, account)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                  {t("dialogs.editRecurring.statusLabel")} <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={editForm.statusCode}
                  onValueChange={(value) =>
                    setEditForm((prev) => ({ ...prev, statusCode: value }))
                  }
                >
                  <SelectTrigger className="w-full cursor-pointer">
                    <SelectValue placeholder={t("dialogs.editRecurring.selectPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {formOptions.statuses.map((status) => (
                      <SelectItem
                        key={status.id}
                        value={String(status.code)}
                        className="cursor-pointer"
                      >
                        {resolveStatusLabel(tRoot, status)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </DetailPanelSection>

          {/* Detalhes: Período · REF · Descrição */}
          <DetailPanelSection title={tCommon("formSections.details")}>
            <div className="grid grid-cols-[96px_1fr] gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                  {t("dialogs.editRecurring.periodLabel")}
                </Label>
                <Input
                  value={editForm.period}
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      period: event.target.value.replace(/\D/g, "").slice(0, 6),
                    }))
                  }
                  placeholder={t("dialogs.editRecurring.periodPlaceholder")}
                  maxLength={6}
                  inputMode="numeric"
                  className="text-center tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                  {t("dialogs.editRecurring.refLabel")}
                </Label>
                <Input
                  value={editForm.reference}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, reference: event.target.value }))
                  }
                  placeholder={t("dialogs.editRecurring.refPlaceholder")}
                />
              </div>
            </div>
            {periodDiverges && (
              <p className="text-[10px] text-muted-foreground">
                {t("dialogs.editRecurring.periodHint")}
              </p>
            )}
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                {t("dialogs.editRecurring.descriptionLabel")}
              </Label>
              <Input
                value={editForm.description}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder={t("dialogs.editRecurring.descriptionPlaceholder")}
              />
            </div>
          </DetailPanelSection>
        </div>
      </DetailPanel>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("dialogs.deleteConfirm.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("dialogs.deleteConfirm.confirmText")}
              {deleteTarget && (
                <span className="mt-2 block text-foreground">
                  {(deleteTarget.note || t("dialogs.historyFallback"))} •{" "}
                  {monetary.formatMonetaryValue(deleteTarget.amount)}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={actionLoading}
              onClick={() => void handleDeleteConfirm()}
            >
              {actionLoading ? t("dialogs.deleteConfirm.deleting") : tCommon("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
