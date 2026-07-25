"use client"

import { useLocale, useTranslations } from "next-intl"
import {
  ArrowRightLeft,
  File,
  FileText,
  Image as ImageIcon,
  Paperclip,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { createDateFormatter } from "@/i18n/format"

import type {
  FormCategory,
  FormCategoryGroup,
  FormPayee,
  TransactionFormOptions,
} from "../types"
import type { InstallmentRow } from "../hooks/use-transaction-form"

type TransactionType = "INCOME" | "EXPENSE" | "TRANSFER"

// ── Helpers ──────────────────────────────────────────────────────────────────

function getTypeAccentClass(t: TransactionType) {
  if (t === "INCOME") return "text-positive border-l-positive"
  if (t === "EXPENSE") return "text-destructive border-l-destructive"
  return "text-info border-l-info"
}

function getTypeDotClass(t: TransactionType) {
  if (t === "INCOME") return "bg-positive"
  if (t === "EXPENSE") return "bg-destructive"
  return "bg-info"
}

function getTypeTextClass(t: TransactionType) {
  if (t === "INCOME") return "text-positive"
  if (t === "EXPENSE") return "text-destructive"
  return "text-info"
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType === "application/pdf")
    return <FileText className="size-3.5 text-destructive shrink-0" />
  if (mimeType.startsWith("image/"))
    return <ImageIcon className="size-3.5 text-info shrink-0" />
  return <File className="size-3.5 text-muted-foreground shrink-0" />
}

// ── Props ────────────────────────────────────────────────────────────────────

interface NewTransactionDialogProps {
  open: boolean
  setOpen: (open: boolean) => void
  isEditing: boolean
  displayNum: string
  type: TransactionType
  setType: (type: TransactionType) => void
  effectiveType: TransactionType
  formData: {
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
  updateField: (
    field: keyof NewTransactionDialogProps["formData"],
    value: string
  ) => void
  filteredGroups: FormCategoryGroup[]
  filteredCategories: FormCategory[]
  isSubmitting: boolean
  handleSubmit: () => void
  formOptions: TransactionFormOptions
  // Installments
  installments: number | ""
  setInstallments: (v: number | "") => void
  installmentRows: InstallmentRow[]
  updateInstallmentRow: (index: number, field: "date" | "amount", value: string) => void
  isProRata: boolean
  setIsProRata: (value: boolean) => void
  // Autocomplete
  suggestions: FormPayee[]
  showSuggestions: boolean
  handleSuggestionClick: (payee: FormPayee) => void
  closeSuggestions: () => void
  // Attachments
  fileInputRef: React.RefObject<HTMLInputElement | null>
  queuedFiles: File[]
  handleFiles: (fileList: FileList) => void
  removeQueued: (idx: number) => void
}

// ── Component ────────────────────────────────────────────────────────────────

export function NewTransactionDialog({
  open,
  setOpen,
  isEditing,
  displayNum,
  type,
  setType,
  effectiveType,
  formData,
  updateField,
  filteredGroups,
  filteredCategories,
  isSubmitting,
  handleSubmit,
  formOptions,
  installments,
  setInstallments,
  installmentRows,
  updateInstallmentRow,
  isProRata,
  setIsProRata,
  suggestions,
  showSuggestions,
  handleSuggestionClick,
  closeSuggestions,
  fileInputRef,
  queuedFiles,
  handleFiles,
  removeQueued,
}: NewTransactionDialogProps) {
  const t = useTranslations("transactions.dialogs.newTransaction")
  const tSections = useTranslations("common.formSections")
  const locale = useLocale()
  const numInstallments = Number(installments || 1)
  const valueAccentClass = getTypeAccentClass(effectiveType)
  const isInstallmentProRata = numInstallments > 1 && isProRata

  const isFormValid =
    formData.date?.trim() !== "" &&
    formData.note?.trim() !== "" &&
    formData.amount?.toString().trim() !== "" &&
    formData.groupCode !== "" &&
    formData.categoryCode !== "" &&
    formData.accountId !== "" &&
    formData.statusCode !== ""

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleSubmit()
  }

  // ── Header interno (título + type switcher) ────────────────────────────
  const panelTitle = (
    <span className="flex items-center gap-2.5">
      <span
        className={`inline-block size-2 rounded-full ${getTypeDotClass(type)}`}
      />
      {isEditing ? t("editTitle") : t("newTitle")}
    </span>
  )

  const panelFooter = (
    <>
      <DetailPanelCloseButton onClick={() => setOpen(false)} />
      <Button
        type="submit"
        form="new-transaction-form"
        disabled={isSubmitting || !isFormValid}
        className="cursor-pointer flex-1 sm:flex-none"
      >
        {isSubmitting
          ? isEditing
            ? t("updating")
            : t("saving")
          : isEditing
            ? t("update")
            : numInstallments > 1
              ? t("saveInstallments", { count: numInstallments })
              : t("save")}
      </Button>
    </>
  )

  return (
    <DetailPanel
      open={open}
      onOpenChange={setOpen}
      title={panelTitle}
      description={t("formDescription")}
      footer={panelFooter}
      className="gap-0"
    >
      {/* Type Switcher */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 mb-4">
        {(
          [
            { key: "INCOME", label: t("typeIncome"), Icon: TrendingUp },
            { key: "EXPENSE", label: t("typeExpense"), Icon: TrendingDown },
            { key: "TRANSFER", label: t("typeTransfer"), Icon: ArrowRightLeft },
          ] as const
        ).map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setType(key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-all cursor-pointer ${type === key
              ? `bg-background shadow-sm ${getTypeTextClass(key)}`
              : "text-muted-foreground hover:text-foreground"
              }`}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Scrollable Form ── */}
      <form
        id="new-transaction-form"
        onSubmit={onSubmit}
        className="flex flex-col gap-4"
      >
          {/* Essencial: Vencimento · Valor */}
          <div className="grid grid-cols-[1fr_150px] gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                {t("dueDateLabel")} <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => updateField("date", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                {t("amountLabel")} <span className="text-destructive">*</span>
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={formData.amount}
                onChange={(e) => updateField("amount", e.target.value)}
                placeholder={t("amountPlaceholder")}
                required
                className={`font-bold text-right border-l-4 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${valueAccentClass}`}
              />
            </div>
          </div>

          {/* Histórico com autocomplete */}
          <div className="relative space-y-1.5">
            <div className="flex items-center gap-2">
              <Label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                {t("historyLabel")} <span className="text-destructive">*</span>
              </Label>
              {showSuggestions && suggestions.length > 0 && (
                <span className="text-[10px] text-info font-medium">
                  {t("suggestionsCount", { count: suggestions.length })}
                </span>
              )}
            </div>
            <Input
              value={formData.note}
              onChange={(e) => updateField("note", e.target.value)}
              onBlur={closeSuggestions}
              autoComplete="off"
              placeholder={t("historyPlaceholder")}
              required
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute z-50 left-0 right-0 top-full mt-0.5 bg-popover border border-border rounded-md shadow-lg overflow-hidden max-h-36 overflow-y-auto">
                {suggestions.map((payee) => (
                  <li
                    key={payee.id}
                    onMouseDown={() => handleSuggestionClick(payee)}
                    className="px-3 py-2 text-xs cursor-pointer hover:bg-accent transition-colors border-b border-border/50 last:border-0"
                  >
                    {payee.name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Classificação: Grupo · Categoria · Banco · Status */}
          <DetailPanelSection title={tSections("classification")}>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                  {t("groupLabel")} <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formData.groupCode}
                  onValueChange={(v) => updateField("groupCode", v)}
                >
                  <SelectTrigger className="w-full cursor-pointer">
                    <SelectValue placeholder={t("selectPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredGroups.map((g) => (
                      <SelectItem
                        key={g.id}
                        value={g.code.toString()}
                        className="cursor-pointer"
                      >
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                  {t("categoryLabel")} <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formData.categoryCode}
                  onValueChange={(v) => updateField("categoryCode", v)}
                  disabled={!formData.groupCode}
                >
                  <SelectTrigger
                    className={`w-full cursor-pointer ${!formData.groupCode ? "opacity-60" : ""}`}
                  >
                    <SelectValue placeholder={t("selectPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredCategories.map((c) => (
                      <SelectItem
                        key={c.id}
                        value={c.code}
                        className="cursor-pointer"
                      >
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                  {t("accountLabel")} <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formData.accountId}
                  onValueChange={(v) => updateField("accountId", v)}
                >
                  <SelectTrigger className="w-full cursor-pointer">
                    <SelectValue placeholder={t("selectPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {formOptions.accounts.map((a) => (
                      <SelectItem
                        key={a.id}
                        value={a.id.toString()}
                        className="cursor-pointer"
                      >
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                  {t("statusLabel")} <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formData.statusCode}
                  onValueChange={(v) => updateField("statusCode", v)}
                >
                  <SelectTrigger className="w-full cursor-pointer">
                    <SelectValue placeholder={t("selectPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {formOptions.statuses.map((s) => (
                      <SelectItem
                        key={s.id}
                        value={s.code.toString()}
                        className="cursor-pointer"
                      >
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </DetailPanelSection>

          {/* Detalhes: NUM · Período · REF · Descrição · Anexos */}
          <DetailPanelSection title={tSections("details")}>
            <div className="grid grid-cols-[64px_96px_1fr] gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                  {t("numLabel")}
                </Label>
                <Input
                  value={displayNum}
                  disabled
                  className="text-muted-foreground text-center"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                  {t("periodLabel")}
                </Label>
                <Input
                  value={isInstallmentProRata ? "" : formData.period}
                  onChange={(e) =>
                    updateField("period", e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder={isInstallmentProRata ? t("automaticPlaceholder") : t("periodPlaceholder")}
                  maxLength={6}
                  inputMode="numeric"
                  disabled={isInstallmentProRata}
                  className={`text-center tabular-nums ${isInstallmentProRata ? "text-muted-foreground" : ""}`}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                  {t("refLabel")}
                </Label>
                <Input
                  value={formData.reference}
                  onChange={(e) => updateField("reference", e.target.value)}
                  placeholder={
                    numInstallments > 1 ? t("refPlaceholderInstallment") : t("refPlaceholderSingle")
                  }
                />
                {numInstallments > 1 && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {formData.reference?.includes("-")
                      ? t("refCustomHint")
                      : t("refDefaultHint")}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                {t("notesLabel")}
              </Label>
              <Input
                value={formData.description}
                onChange={(e) => updateField("description", e.target.value)}
                placeholder={t("notesPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
                <Paperclip className="size-3 text-warning" />
                {t("attachmentsLabel")}
                {queuedFiles.length > 0 && (
                  <span className="text-warning">({queuedFiles.length})</span>
                )}
              </Label>
              <div
                className={`border-2 border-dashed rounded-lg px-3 py-2.5 cursor-pointer transition-all min-h-[40px] ${queuedFiles.length > 0
                  ? "border-warning/60 bg-warning/5"
                  : "border-border hover:border-warning/50 hover:bg-warning/5"
                  }`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  if (e.dataTransfer.files) handleFiles(e.dataTransfer.files)
                }}
              >
                {queuedFiles.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {queuedFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <FileIcon mimeType={f.type} />
                        <span className="flex-1 truncate text-muted-foreground">
                          {f.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {t("fileSizeKb", { size: (f.size / 1024).toFixed(0) })}
                        </span>
                        <button
                          type="button"
                          aria-label={t("removeFileAria")}
                          onClick={(e) => {
                            e.stopPropagation()
                            removeQueued(i)
                          }}
                          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        fileInputRef.current?.click()
                      }}
                      className="text-[11px] text-warning hover:text-warning/80 transition-colors text-left mt-0.5"
                    >
                      {t("addFileButton")}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    <Paperclip className="size-3.5 text-warning shrink-0" />
                    <span>
                      {t("dropHint")}
                    </span>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                multiple
                className="hidden"
                aria-hidden="true"
                title={t("fileInputTitle")}
                onChange={(e) => {
                  if (e.target.files) handleFiles(e.target.files)
                  e.target.value = ""
                }}
              />
            </div>
          </DetailPanelSection>

          {/* Parcelamento: quantidade · pro-rata · preview */}
          {!isEditing && (
            <DetailPanelSection title={t("installmentsPreviewTitle")}>
              <div className="grid grid-cols-[88px_1fr] items-start gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                    {t("installmentsLabel")}
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    value={installments}
                    onChange={(e) => {
                      const v = e.target.value
                      if (v === "") setInstallments("")
                      else {
                        const n = parseInt(v)
                        setInstallments(isNaN(n) ? "" : n)
                      }
                    }}
                    onFocus={() => {
                      if (installments === 1) setInstallments("")
                    }}
                    onBlur={() => {
                      if (installments === "" || installments === 0)
                        setInstallments(1)
                    }}
                    className={`text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${numInstallments === 1
                      ? "text-muted-foreground"
                      : "text-foreground font-semibold"
                      }`}
                  />
                </div>
                {numInstallments > 1 && (
                  <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
                    <Checkbox
                      id="transaction-pro-rata"
                      checked={isProRata}
                      onCheckedChange={(checked) => setIsProRata(checked === true)}
                      className="mt-0.5"
                    />
                    <div className="space-y-0.5">
                      <Label
                        htmlFor="transaction-pro-rata"
                        className="cursor-pointer text-[11px] uppercase tracking-wider font-semibold text-muted-foreground"
                      >
                        {t("proRataLabel")}
                      </Label>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {isProRata
                          ? t("proRataCashHint")
                          : t("proRataAccrualHint")}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {numInstallments > 1 && (
                <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2.5">
                  <p className="text-[11px] text-muted-foreground">
                    {t("installmentsPreviewHint")}
                  </p>
                  <div className="space-y-1.5">
                    {installmentRows.map((row, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-[40px_1fr_130px_80px] gap-2 items-center"
                      >
                        {/* NUM placeholder */}
                        <div className="text-[11px] text-muted-foreground text-center bg-muted rounded px-1 py-1 truncate">
                          —
                        </div>
                        {/* REF */}
                        <div className="text-[11px] text-muted-foreground truncate px-1">
                          {row.ref}
                        </div>
                        {/* Data */}
                        {i === 0 ? (
                          <div className="text-[11px] text-muted-foreground bg-muted rounded px-2 py-1.5 text-center">
                            {createDateFormatter(locale, {}).format(
                              new Date(row.date + "T12:00:00")
                            )}
                          </div>
                        ) : (
                          <Input
                            type="date"
                            value={row.date}
                            onChange={(e) =>
                              updateInstallmentRow(i, "date", e.target.value)
                            }
                            className="h-7 text-[11px] px-2"
                          />
                        )}
                        {/* Valor */}
                        <Input
                          type="number"
                          step="0.01"
                          value={row.amount}
                          disabled={i === 0}
                          onChange={(e) =>
                            updateInstallmentRow(i, "amount", e.target.value)
                          }
                          className={`h-7 text-[11px] px-2 text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${i === 0
                            ? "text-muted-foreground opacity-60"
                            : `font-semibold ${getTypeTextClass(effectiveType)}`
                            }`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </DetailPanelSection>
          )}
      </form>
    </DetailPanel>
  )
}
