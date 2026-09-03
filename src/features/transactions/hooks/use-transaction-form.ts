"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"

import { useDateClosing } from "@/features/security/components/date-closing-provider"
import { useDateClosingGuard } from "@/features/security/components/date-closing-guard"
import { closedInstallments } from "@/features/security/lib/batch-loops"
import { dayKeyOfLocal } from "@/features/security/lib/date-closing"
import { periodFromDate } from "@/lib/financial"
import { PAID_STATUS_NAMES } from "@/lib/paid-status"
import type {
  FormCategory,
  FormCategoryGroup,
  FormPayee,
  SerializedTransaction,
  TransactionFormOptions,
} from "../types"

type TransactionType = "INCOME" | "EXPENSE" | "TRANSFER"

// ── Installment row ──────────────────────────────────────────────────────────
export interface InstallmentRow {
  num: string   // display only — gerado server-side
  ref: string
  date: string
  amount: string
}

// ── Form data ────────────────────────────────────────────────────────────────
interface FormData {
  date: string
  period: string
  reference: string
  note: string
  description: string
  amount: string
  accountId: string
  groupCode: string
  categoryCode: string
  statusCode: string
  payeeId: string
}

function getInitialFormData(): FormData {
  const date = dayKeyOfLocal(new Date())
  return {
    date,
    period: periodFromDate(date),
    reference: "",
    note: "",
    description: "",
    amount: "",
    accountId: "",
    groupCode: "",
    categoryCode: "",
    statusCode: "",
    payeeId: "",
  }
}

function getLegacyStatusCandidates(
  status: SerializedTransaction["status"]
): string[] {
  // "Pago" vem do critério único do sistema (src/lib/paid-status.ts). Sem isso,
  // um lançamento cujo status se chama "Paga" ou "Quitado" não encontrava
  // candidato aqui e o formulário caía no primeiro status da lista — ou seja,
  // reabrir e salvar TROCAVA o status do lançamento sem avisar.
  if (status === "PAID") return [...PAID_STATUS_NAMES]
  if (status === "PENDING") return ["PENDENTE", "PENDING"]
  if (status === "OVERDUE") return ["VENCIDO", "OVERDUE"]
  return ["ABERTO", "AGENDADO", "SCHEDULED"]
}

// ── Attachment validation ────────────────────────────────────────────────────
const MAX_FILE_SIZE = 3 * 1024 * 1024 // 3 MB
const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
]

// ── Hook params ──────────────────────────────────────────────────────────────
interface UseTransactionFormParams {
  formOptions: TransactionFormOptions
  onSuccess: () => void
}

export function useTransactionForm({
  formOptions,
  onSuccess,
}: UseTransactionFormParams) {
  const t = useTranslations("transactions.form")
  // Os avisos de lote moram em `transactions.toasts`, ao lado dos outros toasts de lote.
  const tToasts = useTranslations("transactions.toasts")
  const { state } = useDateClosing()
  const guard = useDateClosingGuard()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<TransactionType>("EXPENSE")
  const [formData, setFormData] = useState<FormData>(getInitialFormData)
  const [filteredGroups, setFilteredGroups] = useState<FormCategoryGroup[]>([])
  const [filteredCategories, setFilteredCategories] = useState<FormCategory[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(
    null
  )
  const [displayNum, setDisplayNum] = useState(() => t("autoNum"))

  // ── Installments ────────────────────────────────────────────────────────
  const [installments, setInstallments] = useState<number | "">(1)
  const [installmentRows, setInstallmentRows] = useState<InstallmentRow[]>([])
  const [isProRata, setIsProRata] = useState(false)

  // ── Autocomplete ────────────────────────────────────────────────────────
  const [suggestions, setSuggestions] = useState<FormPayee[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  // ── Attachments ─────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [queuedFiles, setQueuedFiles] = useState<File[]>([])

  // Track whether we're inside openDialog to suppress cascading auto-selects
  const isResettingRef = useRef(false)

  // ── effectiveType: driven by the selected category's type ────────────────
  const selectedCategory = formOptions.categories.find(
    (c) => c.code === formData.categoryCode
  )
  const effectiveType: TransactionType = selectedCategory?.type ?? type

  // ── Open dialog ──────────────────────────────────────────────────────────
  const openDialog = useCallback((defaultDateStr?: string | unknown) => {
    isResettingRef.current = true

    let dateToUse = dayKeyOfLocal(new Date())
    if (typeof defaultDateStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(defaultDateStr)) {
      dateToUse = defaultDateStr
    }

    const defaultStatus = formOptions.statuses.find(
      (s) => s.name.toUpperCase() === "ABERTO"
    )
    const defaultAccount = formOptions.accounts.find(
      (a) => a.name.toUpperCase() === "DEFINIR"
    )
    const expenseGroups = formOptions.groups.filter((g) => g.type === "EXPENSE")
    const firstGroup = expenseGroups[0]
    const firstCategory = firstGroup
      ? formOptions.categories.find((c) => c.groupId === firstGroup.id)
      : undefined

    setType("EXPENSE")
    setFilteredGroups(expenseGroups)
    setFilteredCategories(
      firstGroup
        ? formOptions.categories.filter((c) => c.groupId === firstGroup.id)
        : []
    )
    setFormData({
      date: dateToUse,
      period: periodFromDate(dateToUse),
      reference: "",
      note: "",
      description: "",
      amount: "",
      accountId: defaultAccount
        ? defaultAccount.id.toString()
        : formOptions.accounts[0]?.id.toString() ?? "",
      groupCode: firstGroup ? firstGroup.code.toString() : "",
      categoryCode: firstCategory ? firstCategory.code : "",
      statusCode: defaultStatus ? defaultStatus.code.toString() : "",
      payeeId: "",
    })
    setEditingTransactionId(null)
    setDisplayNum(t("autoNum"))
    setInstallments(1)
    setInstallmentRows([])
    setIsProRata(false)
    setQueuedFiles([])
    setSuggestions([])
    setShowSuggestions(false)
    setOpen(true)

    requestAnimationFrame(() => {
      isResettingRef.current = false
    })
  }, [formOptions, t])

  // ── Open dialog in edit mode ──────────────────────────────────────────────
  const openEditDialog = useCallback(
    (transaction: SerializedTransaction) => {
      isResettingRef.current = true

      const selectedCategory = formOptions.categories.find(
        (c) => c.id === transaction.category.id
      )
      const selectedType: TransactionType =
        selectedCategory?.type ?? transaction.type
      const groupsForType = formOptions.groups.filter(
        (g) => g.type === selectedType
      )

      const selectedGroupByCategory = selectedCategory
        ? formOptions.groups.find((g) => g.id === selectedCategory.groupId)
        : undefined
      const selectedGroupByTx = formOptions.groups.find(
        (g) => g.id === transaction.category.group.id
      )
      const groupToUse =
        selectedGroupByCategory && selectedGroupByCategory.type === selectedType
          ? selectedGroupByCategory
          : selectedGroupByTx && selectedGroupByTx.type === selectedType
            ? selectedGroupByTx
            : groupsForType[0]

      const categoriesForGroup = groupToUse
        ? formOptions.categories.filter((c) => c.groupId === groupToUse.id)
        : []
      const categoryToUse =
        selectedCategory && groupToUse && selectedCategory.groupId === groupToUse.id
          ? selectedCategory
          : categoriesForGroup[0]

      const targetLegacyStatuses = getLegacyStatusCandidates(transaction.status)
      const statusToUse =
        formOptions.statuses.find(
          (s) => targetLegacyStatuses.includes(s.name.toUpperCase().trim())
        ) ?? formOptions.statuses[0]

      const accountExists = formOptions.accounts.some(
        (a) => a.id.toString() === transaction.account.id
      )
      const accountToUse = accountExists
        ? transaction.account.id
        : formOptions.accounts[0]?.id.toString() ?? ""

      setType(selectedType)
      setFilteredGroups(groupsForType)
      setFilteredCategories(categoriesForGroup)
      setFormData({
        date: transaction.date.slice(0, 10),
        period: transaction.period || periodFromDate(transaction.date.slice(0, 10)),
        reference: transaction.reference ?? "",
        note: transaction.note ?? "",
        description: transaction.description ?? "",
        amount: Math.abs(transaction.amount).toString(),
        accountId: accountToUse,
        groupCode: groupToUse ? groupToUse.code.toString() : "",
        categoryCode: categoryToUse?.code ?? "",
        statusCode: statusToUse ? statusToUse.code.toString() : "",
        payeeId: transaction.payee?.id ? String(transaction.payee.id) : "",
      })
      setDisplayNum(transaction.num ? String(transaction.num) : "—")
      setEditingTransactionId(transaction.id)
      setInstallments(1)
      setInstallmentRows([])
      setIsProRata(false)
      setQueuedFiles([])
      setSuggestions([])
      setShowSuggestions(false)
      setOpen(true)

      requestAnimationFrame(() => {
        isResettingRef.current = false
      })
    },
    [formOptions]
  )

  // ── Open dialog in copy mode ──────────────────────────────────────────────
  const openCopyDialog = useCallback(
    (transaction: SerializedTransaction) => {
      isResettingRef.current = true

      const selectedCategory = formOptions.categories.find(
        (c) => c.id === transaction.category.id
      )
      const selectedType: TransactionType =
        selectedCategory?.type ?? transaction.type
      const groupsForType = formOptions.groups.filter(
        (g) => g.type === selectedType
      )

      const selectedGroupByCategory = selectedCategory
        ? formOptions.groups.find((g) => g.id === selectedCategory.groupId)
        : undefined
      const selectedGroupByTx = formOptions.groups.find(
        (g) => g.id === transaction.category.group.id
      )
      const groupToUse =
        selectedGroupByCategory && selectedGroupByCategory.type === selectedType
          ? selectedGroupByCategory
          : selectedGroupByTx && selectedGroupByTx.type === selectedType
            ? selectedGroupByTx
            : groupsForType[0]

      const categoriesForGroup = groupToUse
        ? formOptions.categories.filter((c) => c.groupId === groupToUse.id)
        : []
      const categoryToUse =
        selectedCategory && groupToUse && selectedCategory.groupId === groupToUse.id
          ? selectedCategory
          : categoriesForGroup[0]

      const targetLegacyStatuses = getLegacyStatusCandidates(transaction.status)
      const statusToUse =
        formOptions.statuses.find(
          (s) => targetLegacyStatuses.includes(s.name.toUpperCase().trim())
        ) ?? formOptions.statuses[0]

      const accountExists = formOptions.accounts.some(
        (a) => a.id.toString() === transaction.account.id
      )
      const accountToUse = accountExists
        ? transaction.account.id
        : formOptions.accounts[0]?.id.toString() ?? ""

      setType(selectedType)
      setFilteredGroups(groupsForType)
      setFilteredCategories(categoriesForGroup)
      
      const today = dayKeyOfLocal(new Date())
      
      setFormData({
        date: today,
        period: periodFromDate(today),
        reference: transaction.reference ?? "",
        note: transaction.note ?? "",
        description: transaction.description ?? "",
        amount: Math.abs(transaction.amount).toString(),
        accountId: accountToUse,
        groupCode: groupToUse ? groupToUse.code.toString() : "",
        categoryCode: categoryToUse?.code ?? "",
        statusCode: statusToUse ? statusToUse.code.toString() : "",
        payeeId: transaction.payee?.id ? String(transaction.payee.id) : "",
      })
      setDisplayNum(t("autoNum"))
      setEditingTransactionId(null)
      setInstallments(1)
      setInstallmentRows([])
      setIsProRata(false)
      setQueuedFiles([])
      setSuggestions([])
      setShowSuggestions(false)
      setOpen(true)

      requestAnimationFrame(() => {
        isResettingRef.current = false
      })
    },
    [formOptions, t]
  )

  // ── Filter groups by type ────────────────────────────────────────────────
  useEffect(() => {
    if (isResettingRef.current) return

    const groups = formOptions.groups.filter((g) => g.type === type)
    setFilteredGroups(groups)

    const currentValid = groups.some(
      (g) => g.code.toString() === formData.groupCode
    )
    if (!currentValid && groups.length > 0) {
      const firstCats = formOptions.categories.filter(
        (c) => c.groupId === groups[0].id
      )
      setFilteredCategories(firstCats)
      setFormData((prev) => ({
        ...prev,
        groupCode: groups[0].code.toString(),
        categoryCode: firstCats[0]?.code ?? "",
        payeeId: "",
      }))
    }
  }, [type, formData.groupCode, formOptions.groups, formOptions.categories])

  // ── Filter categories by selected group ──────────────────────────────────
  useEffect(() => {
    if (isResettingRef.current) return
    if (!formData.groupCode) {
      setFilteredCategories([])
      return
    }

    const group = formOptions.groups.find(
      (g) => g.code.toString() === formData.groupCode
    )
    if (!group) return

    const cats = formOptions.categories.filter((c) => c.groupId === group.id)
    setFilteredCategories(cats)

    const currentValid = cats.some((c) => c.code === formData.categoryCode)
    if (!currentValid && cats.length > 0) {
      setFormData((prev) => ({ ...prev, categoryCode: cats[0].code }))
    }
  }, [formData.groupCode, formData.categoryCode, formOptions.groups, formOptions.categories])

  // ── Auto-fill reference when installments > 1 ───────────────────────────
  useEffect(() => {
    const n = Number(installments || 1)
    if (n > 1 && !formData.reference) {
      const padded = String(n).padStart(2, "0")
      setFormData((prev) => ({ ...prev, reference: `#01/${padded}` }))
    }
  }, [installments, formData.reference])

  // ── Recalculate installment rows ─────────────────────────────────────────
  useEffect(() => {
    const n = Number(installments || 1)
    if (n <= 1) {
      setInstallmentRows([])
      return
    }

    const baseAmount = parseFloat(formData.amount || "0")
    const baseDate = new Date(formData.date + "T12:00:00")

    const rows: InstallmentRow[] = []
    for (let i = 0; i < n; i++) {
      const d = new Date(baseDate)
      d.setMonth(baseDate.getMonth() + i)

      const currentRef = formData.reference
      const isDefaultPattern =
        !currentRef ||
        /^#\d+\/\d+$/.test(currentRef) ||
        /^\(\d+\/\d+\)$/.test(currentRef)

      const ref = isDefaultPattern
        ? `#${String(i + 1).padStart(2, "0")}/${String(n).padStart(2, "0")}`
        : `${currentRef}-${i + 1}`

      rows.push({
        num: `${i + 1}`, // placeholder visual; real NUM gerado server-side
        ref,
        date: dayKeyOfLocal(d),
        amount: baseAmount.toFixed(2),
      })
    }
    setInstallmentRows(rows)
  }, [installments, formData.amount, formData.date, formData.reference])

  // ── Update a single field ────────────────────────────────────────────────
  const updateField = useCallback(
    (field: keyof FormData, value: string) => {
      setFormData((prev) => {
        if (field === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
          const prevDerived = periodFromDate(prev.date)
          const shouldSyncPeriod = !prev.period || prev.period === prevDerived
          return {
            ...prev,
            date: value,
            period: shouldSyncPeriod ? periodFromDate(value) : prev.period,
          }
        }
        return { ...prev, [field]: value }
      })

      // Autocomplete logic for "note" field
      if (field === "note") {
        if (value.length > 0) {
          const matches = formOptions.payees
            .filter((p) => p.name.toLowerCase().includes(value.toLowerCase()))
            .slice(0, 5)
          setSuggestions(matches)
          setShowSuggestions(matches.length > 0)
        } else {
          setSuggestions([])
          setShowSuggestions(false)
        }
      }
    },
    [formOptions.payees]
  )

  const updateInstallmentRow = useCallback(
    (index: number, field: "date" | "amount", value: string) => {
      setInstallmentRows((prev) => {
        const next = [...prev]
        next[index] = { ...next[index], [field]: value }
        return next
      })
    },
    []
  )

  // ── Autocomplete suggestion click ────────────────────────────────────────
  const handleSuggestionClick = useCallback((payee: FormPayee) => {
    setFormData((prev) => ({
      ...prev,
      note: payee.name,
      payeeId: payee.id.toString(),
    }))
    setSuggestions([])
    setShowSuggestions(false)
  }, [])

  const closeSuggestions = useCallback(() => {
    setTimeout(() => setShowSuggestions(false), 200)
  }, [])

  // ── Attachment handlers ──────────────────────────────────────────────────
  const handleFiles = useCallback((fileList: FileList) => {
    const valid = Array.from(fileList).filter(
      (f) => ALLOWED_MIME.includes(f.type) && f.size <= MAX_FILE_SIZE
    )
    const rejected = Array.from(fileList).length - valid.length
    if (rejected > 0) {
      toast.error(t("fileRejected", { count: rejected }))
    }
    setQueuedFiles((prev) => [...prev, ...valid])
  }, [t])

  const removeQueued = useCallback((idx: number) => {
    setQueuedFiles((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return

    if (
      !formData.date ||
      !formData.amount ||
      !formData.accountId ||
      !formData.groupCode ||
      !formData.categoryCode ||
      !formData.statusCode
    ) {
      toast.error(t("requiredFields"))
      return
    }

    const parsedAmount = parseFloat(formData.amount)
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      toast.error(t("negativeAmount"))
      return
    }

    setIsSubmitting(true)

    try {
      const payeeId = formData.payeeId
        ? parseInt(formData.payeeId)
        : undefined
      const payeeName = !payeeId && formData.note?.trim()
        ? formData.note.trim()
        : undefined

      if (editingTransactionId) {
        const payload = {
          date: formData.date,
          period: formData.period?.trim() || undefined,
          reference: formData.reference?.trim() || undefined,
          note: formData.note?.trim() || undefined,
          description: formData.description?.trim() || undefined,
          amount: parsedAmount,
          type,
          accountId: parseInt(formData.accountId),
          groupCode: parseInt(formData.groupCode),
          categoryCode: formData.categoryCode,
          statusCode: parseInt(formData.statusCode),
          payeeId,
          payeeName,
        }

        const res = await fetch(`/api/transactions/${editingTransactionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || t("updateError"))
        }

        if (queuedFiles.length > 0) {
          const fd = new FormData()
          queuedFiles.forEach((f) => fd.append("files", f))
          const attRes = await fetch(
            `/api/transactions/${editingTransactionId}/attachments`,
            { method: "POST", body: fd }
          )
          if (!attRes.ok) {
            toast.warning(t("attachmentsUpdateWarning"))
          }
        }

        toast.success(t("updateSuccess"))
        setOpen(false)
        setEditingTransactionId(null)
        onSuccess()
        return
      }

      const numInstallments = Number(installments || 1)
      const competencePeriod =
        formData.period?.trim() || periodFromDate(formData.date)

      // Build the list of transaction payloads
      const payloads =
        numInstallments > 1
          ? installmentRows.map((row) => ({
            date: row.date,
            period: isProRata ? periodFromDate(row.date) : competencePeriod,
            reference: row.ref,
            note: formData.note?.trim() || undefined,
            description: formData.description?.trim() || undefined,
            amount: parseFloat(row.amount || "0"),
            type,
            accountId: parseInt(formData.accountId),
            groupCode: parseInt(formData.groupCode),
            categoryCode: formData.categoryCode,
            statusCode: parseInt(formData.statusCode),
            payeeId,
            payeeName,
          }))
          : [
            {
              date: formData.date,
              period: formData.period?.trim() || undefined,
              reference: formData.reference?.trim() || undefined,
              note: formData.note?.trim() || undefined,
              description: formData.description?.trim() || undefined,
              amount: parsedAmount,
              type,
              accountId: parseInt(formData.accountId),
              groupCode: parseInt(formData.groupCode),
              categoryCode: formData.categoryCode,
              statusCode: parseInt(formData.statusCode),
              payeeId,
              payeeName,
            },
          ]

      // Parcelas em dia fechado: perguntamos ANTES do laço, senão a pessoa criaria as primeiras
      // parcelas e só esbarraria na trava no meio do caminho. Com um token já em mãos, nada a
      // perguntar. Recusou: nada é criado (o `finally` solta o botão).
      const closedDays = closedInstallments(
        payloads.map((payload) => payload.date),
        state?.closedThrough ?? null,
      )
      if (closedDays.length > 0 && !guard.hasValidToken()) {
        const ok = await guard.requestOverride(closedDays)
        if (!ok) return
      }

      // Create all transactions sequentially (to respect NUM ordering)
      const createdIds: string[] = []
      try {
        // Um PIN para as parcelas todas: a resposta da primeira vale para as seguintes.
        guard.beginBatch()
        for (const payload of payloads) {
          const res = await fetch("/api/transactions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
          if (!res.ok) {
            const data = await res.json()
            throw new Error(data.error || t("createError"))
          }
          const created = await res.json()
          createdIds.push(created.transaction?.id)
        }
      } catch (error) {
        // Parte das parcelas já nasceu: dizer quantas, senão a pessoa tenta de novo e duplica.
        if (createdIds.length > 0) {
          toast.warning(
            tToasts("installmentsPartial", {
              done: createdIds.length,
              total: payloads.length,
            }),
          )
        }
        throw error
      } finally {
        guard.endBatch()
      }

      // Upload attachments to the first (or only) transaction
      if (queuedFiles.length > 0 && createdIds[0]) {
        const fd = new FormData()
        queuedFiles.forEach((f) => fd.append("files", f))
        const attRes = await fetch(
          `/api/transactions/${createdIds[0]}/attachments`,
          { method: "POST", body: fd }
        )
        if (!attRes.ok) {
          toast.warning(t("attachmentsCreateWarning"))
        }
      }

      const msg =
        numInstallments > 1
          ? t("installmentsCreateSuccess", { count: numInstallments })
          : t("createSuccess")
      toast.success(msg)
      setOpen(false)
      setEditingTransactionId(null)
      onSuccess()
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : editingTransactionId
            ? t("updateError")
            : t("createError")
      )
    } finally {
      setIsSubmitting(false)
    }
  }, [
    editingTransactionId,
    formData,
    type,
    installments,
    t,
    installmentRows,
    isProRata,
    queuedFiles,
    isSubmitting,
    onSuccess,
    guard,
    state,
    tToasts,
  ])

  return {
    open,
    setOpen,
    openDialog,
    openEditDialog,
    openCopyDialog,
    isEditing: editingTransactionId !== null,
    displayNum,
    type,
    setType,
    formData,
    updateField,
    filteredGroups,
    filteredCategories,
    effectiveType,
    isSubmitting,
    handleSubmit,
    // Installments
    installments,
    setInstallments,
    installmentRows,
    updateInstallmentRow,
    isProRata,
    setIsProRata,
    // Autocomplete
    suggestions,
    showSuggestions,
    handleSuggestionClick,
    closeSuggestions,
    // Attachments
    fileInputRef,
    queuedFiles,
    handleFiles,
    removeQueued,
  }
}
