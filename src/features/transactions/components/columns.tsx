"use client"

import type { ColumnDef, FilterFn, Row } from "@tanstack/react-table"
import { Lock } from "lucide-react"
import { useTranslations } from "next-intl"

import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { useDateClosing } from "@/features/security/components/date-closing-provider"
import { dayKeyOfStored, isDayClosed } from "@/features/security/lib/date-closing"
import { formatPeriod } from "@/lib/financial"
import type { MonetaryFormatter } from "@/lib/monetary"
import { multiSelectFilter } from "@/lib/table-export"
import { cn } from "@/lib/utils"
import { createDateFormatter } from "@/i18n/format"
import {
  resolveAccountLabel,
  resolveCategoryLabel,
  resolveGroupLabel,
  type Translate,
} from "@/i18n/chart-labels"

import type { SerializedTransaction, TransactionTableMeta } from "../types"
import { DataTableColumnHeader } from "./data-table-column-header"
import { TransactionActions } from "./transaction-actions"
import { StatusDot } from "../../shared/components/status-dot"

export interface TransactionColumnLabels {
  num: string
  period: string
  date: string
  reference: string
  note: string
  description: string
  group: string
  category: string
  amount: string
  account: string
  status: string
  type: string
  actions: string
  payee: string
  selectAllAria: string
  selectRowAria: string
  statusPaid: string
  statusPending: string
  statusOverdue: string
  statusScheduled: string
  typeIncome: string
  typeExpense: string
  typeTransfer: string
}

/** Rótulos legíveis por id de coluna — usados pelo menu Ferramentas e pela exportação. */
export function useTransactionColumnLabels(): Record<string, string> {
  const t = useTranslations("transactions.columns")
  return {
    account: t("account"),
    amount: t("amount"),
    category: t("category"),
    date: t("date"),
    description: t("description"),
    group: t("group"),
    note: t("note"),
    num: t("num"),
    payee: t("payee"),
    period: t("period"),
    reference: t("reference"),
    status: t("status"),
    type: t("type"),
  }
}

function buildStatusConfig(
  labels: TransactionColumnLabels
): Record<string, { label: string; className: string }> {
  return {
    PAID: { label: labels.statusPaid, className: "bg-positive/15 text-positive border-positive/30" },
    PENDING: { label: labels.statusPending, className: "bg-warning/15 text-warning border-warning/30" },
    OVERDUE: { label: labels.statusOverdue, className: "bg-destructive/15 text-destructive border-destructive/30" },
    SCHEDULED: { label: labels.statusScheduled, className: "bg-info/15 text-info border-info/30" },
  }
}

function buildTypeConfig(
  labels: TransactionColumnLabels
): Record<string, { label: string; className: string }> {
  return {
    INCOME: { label: labels.typeIncome, className: "text-positive" },
    EXPENSE: { label: labels.typeExpense, className: "text-destructive" },
    TRANSFER: { label: labels.typeTransfer, className: "text-muted-foreground" },
  }
}

type TransactionColumnFormatter = Pick<
  MonetaryFormatter,
  "formatMonetaryValue" | "getSearchCandidates"
>

interface ParsedAmountQuery {
  hasSeparator: boolean
  intPart: string
  fractionPart: string
  trailingSeparator: boolean
}

function stripLeadingZeros(value: string): string {
  const normalized = value.replace(/^0+(?=\d)/, "")
  return normalized.length > 0 ? normalized : "0"
}

function parseAmountQuery(search: string): ParsedAmountQuery | null {
  const numericToken = search.match(/-?\d[\d.,]*/)
  if (!numericToken) return null

  const token = numericToken[0]
  const lastSeparatorIndex = Math.max(token.lastIndexOf(","), token.lastIndexOf("."))

  if (lastSeparatorIndex === -1) {
    return {
      hasSeparator: false,
      intPart: token.replace(/\D/g, ""),
      fractionPart: "",
      trailingSeparator: false,
    }
  }

  const intPart = token.slice(0, lastSeparatorIndex).replace(/\D/g, "")
  const fractionRaw = token.slice(lastSeparatorIndex + 1)

  return {
    hasSeparator: true,
    intPart,
    fractionPart: fractionRaw.replace(/\D/g, ""),
    trailingSeparator: fractionRaw.length === 0,
  }
}

function matchesAmountSearch(
  amount: number,
  search: string,
  monetary: TransactionColumnFormatter,
): boolean {
  const parsed = parseAmountQuery(search)
  if (!parsed) return false

  const absoluteAmount = Math.abs(amount)
  const [amountIntRaw, amountFraction] = absoluteAmount.toFixed(2).split(".")
  const amountInt = stripLeadingZeros(amountIntRaw)
  const amountDigits = `${amountInt}${amountFraction}`
  const textCandidates = monetary.getSearchCandidates(amount)

  if (parsed.hasSeparator) {
    const searchInt = stripLeadingZeros(parsed.intPart || "0")
    if (parsed.trailingSeparator || parsed.fractionPart.length === 0) {
      return amountInt === searchInt
    }

    if (amountInt !== searchInt) return false
    return amountFraction.startsWith(parsed.fractionPart)
  }

  if (textCandidates.some((value) => value.includes(search))) {
    return true
  }

  const searchDigits = stripLeadingZeros(parsed.intPart)
  return searchDigits.length > 0 && amountDigits.includes(searchDigits)
}

function getAmountColorClass(amount: number): string {
  if (amount < 0) return "text-destructive"
  if (amount > 0) return "text-positive"
  return "text-muted-foreground"
}

export function createTransactionGlobalFilter(
  monetary: TransactionColumnFormatter,
  labels: TransactionColumnLabels,
  locale: string,
  t: Translate,
): FilterFn<SerializedTransaction> {
  const statusConfig = buildStatusConfig(labels)
  const typeConfig = buildTypeConfig(labels)

  return (row: Row<SerializedTransaction>, _columnId: string, filterValue: string) => {
    const search = filterValue.toLowerCase()

    const description = (row.getValue("description") as string)?.toLowerCase() || ""
    const note = (row.getValue("note") as string)?.toLowerCase() || ""
    const reference = (row.getValue("reference") as string)?.toLowerCase() || ""
    const payee = (row.getValue("payee") as string)?.toLowerCase() || ""
    // Busca pelo rótulo EXIBIDO (mesma regra de statusConfig/typeConfig logo
    // abaixo): o usuário procura pelo que está na tela, não pelo nome do banco.
    const category = row.original.category
      ? resolveCategoryLabel(t, row.original.category).toLowerCase()
      : ""
    const group = row.original.category?.group
      ? resolveGroupLabel(t, row.original.category.group).toLowerCase()
      : ""
    const account = row.original.account
      ? resolveAccountLabel(t, row.original.account).toLowerCase()
      : ""
    const period = (row.getValue("period") as string)?.toLowerCase() || ""
    const formattedPeriod =
      period.length === 6 ? formatPeriod(period).toLowerCase() : ""

    const dateStr = row.getValue("date") as string
    const formattedDate = dateStr
      ? createDateFormatter(locale, {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(dateStr))
      : ""

    const status = row.getValue("status") as string
    const translatedStatus = statusConfig[status]?.label.toLowerCase() || ""

    const type = row.original.type as string
    const translatedType = typeConfig[type]?.label.toLowerCase() || ""

    const amount = row.getValue("amount") as number
    const amountMatches = matchesAmountSearch(amount, search, monetary)

    return (
      description.includes(search) ||
      note.includes(search) ||
      reference.includes(search) ||
      payee.includes(search) ||
      category.includes(search) ||
      group.includes(search) ||
      account.includes(search) ||
      period.includes(search) ||
      formattedPeriod.includes(search) ||
      formattedDate.includes(search) ||
      translatedStatus.includes(search) ||
      translatedType.includes(search) ||
      amountMatches
    )
  }
}

const statusSortWeights: Record<string, number> = {
  SCHEDULED: 1,
  PENDING: 2,
  OVERDUE: 3,
  PAID: 4,
}

export const statusSortFn = (
  rowA: Row<SerializedTransaction>,
  rowB: Row<SerializedTransaction>,
  columnId: string,
) => {
  const statusA = rowA.getValue(columnId) as string
  const statusB = rowB.getValue(columnId) as string

  const weightA = statusSortWeights[statusA] || 99
  const weightB = statusSortWeights[statusB] || 99

  if (weightA === weightB) return 0
  return weightA > weightB ? 1 : -1
}

/**
 * Data da linha, com cadeado quando o dia já está fechado. O corte vem do provider
 * (`useDateClosing`), então a coluna não precisa carregá-lo por `meta`: cada célula lê o mesmo
 * estado compartilhado, que é buscado uma vez por painel.
 *
 * Enquanto o estado não chegou (`state === null`) o corte é `null` e NENHUMA linha ganha
 * cadeado — a mesma regra do switch: melhor mudo que chutado, porque um cadeado que aparece
 * e some é pior que um cadeado que demora meio segundo.
 *
 * A data é guardada ao meio-dia UTC, por isso `dayKeyOfStored`: derivar pelo dia local traria
 * o dia anterior a oeste de Greenwich e o cadeado cairia na linha errada.
 */
function TransactionDateCell({
  dateStr,
  locale,
  isMobile,
}: {
  dateStr: string
  locale: string
  isMobile: boolean
}) {
  const t = useTranslations("transactions.closing")
  const { state } = useDateClosing()

  const parsed = new Date(dateStr)
  const formatted = createDateFormatter(locale, {
    day: "2-digit",
    month: "2-digit",
    year: isMobile ? undefined : "numeric",
    timeZone: "UTC",
  }).format(parsed)
  const locked = isDayClosed(dayKeyOfStored(parsed), state?.closedThrough ?? null)

  return (
    <div className="flex items-center gap-1.5">
      {locked && (
        <Lock aria-label={t("lockedRowAria")} className="text-muted-foreground size-3 shrink-0" />
      )}
      <span className="truncate text-sm">{formatted}</span>
    </div>
  )
}

export function getTransactionColumns(
  monetary: TransactionColumnFormatter,
  isMobile: boolean = false,
  labels: TransactionColumnLabels,
  locale: string,
  t: Translate,
): ColumnDef<SerializedTransaction>[] {
  const statusConfig = buildStatusConfig(labels)
  const typeConfig = buildTypeConfig(labels)

  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label={labels.selectAllAria}
          className="translate-y-[2px] cursor-pointer"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label={labels.selectRowAria}
          className="translate-y-[2px] cursor-pointer"
        />
      ),
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      // minSize próprio: o minSize 64 do defaultColumn sobrescreveria o size na
      // leitura e a coluna da checkbox sairia com 64px em vez de 36.
      minSize: 36,
      size: 36,
    },
    {
      accessorKey: "num",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={labels.num} />
      ),
      cell: ({ row }) => {
        const num = row.getValue("num") as number | null
        return <div className="truncate text-sm">{num ?? "—"}</div>
      },
      // `size` = peso no layout "cabe no contêiner": colunas curtas pesam menos, texto
      // pesa mais. As reticências acompanham a largura da coluna (truncate sem teto fixo).
      size: 72,
      minSize: 72,
      meta: { responsive: "hide-mobile" },
    },
    {
      accessorKey: "period",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={labels.period} />
      ),
      cell: ({ row }) => {
        const period = (row.getValue("period") as string | null) ?? ""
        const formatted = period.length === 6 ? formatPeriod(period) : "—"
        return <div className="truncate text-sm tabular-nums">{formatted}</div>
      },
      // minSize acima do padrão (64): valores curtos e fixos (data, período, valor, status)
      // e seus rótulos nunca devem cortar; quem encolhe primeiro são as colunas de texto.
      size: 100,
      minSize: 100,
      meta: { responsive: "hide-mobile" },
    },
    {
      accessorKey: "date",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={labels.date} />
      ),
      cell: ({ row }) => (
        <TransactionDateCell
          dateStr={row.getValue("date") as string}
          locale={locale}
          isMobile={isMobile}
        />
      ),
      // 14px a mais que antes (104/96): o cadeado e o espaço dele comem 18px, e com a largura
      // velha "08/01/2026" saía cortado em "08/01/2…". Data é valor curto e fixo — a mesma regra
      // do minSize da competência: nunca corta.
      size: 118,
      minSize: 110,
    },
    {
      accessorKey: "reference",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={labels.reference} />
      ),
      cell: ({ row }) => (
        <div className="truncate text-sm">
          {row.getValue("reference") || "—"}
        </div>
      ),
      size: 120,
      meta: { responsive: "hide-mobile" },
    },
    {
      accessorKey: "note",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={labels.note} />
      ),
      cell: ({ row }) => (
        <div className="truncate text-sm">
          {row.getValue("note") || "—"}
        </div>
      ),
      size: 200,
      minSize: 80,
      meta: { responsive: "hide-mobile" },
    },
    {
      accessorKey: "description",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={labels.description} />
      ),
      cell: ({ row }) => (
        <div className="truncate text-sm">
          {row.getValue("description") || "—"}
        </div>
      ),
      size: 200,
      minSize: 80,
    },
    {
      id: "group",
      accessorFn: (row) => row.category.group.name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={labels.group} />
      ),
      cell: ({ row }) => (
        <div className="truncate text-sm">
          {resolveGroupLabel(t, row.original.category.group)}
        </div>
      ),
      size: 150,
      minSize: 80,
      meta: { responsive: "hide-mobile" },
    },
    {
      id: "category",
      accessorFn: (row) => row.category.name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={labels.category} />
      ),
      cell: ({ row }) => (
        <div className="truncate text-sm">
          {resolveCategoryLabel(t, row.original.category)}
        </div>
      ),
      filterFn: (row, _id, value) => {
        return value.includes(row.original.category.name)
      },
      size: 190,
      minSize: 80,
      meta: { responsive: "hide-mobile" },
    },
    {
      accessorKey: "amount",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={labels.amount} />
      ),
      cell: ({ row }) => {
        const amount = row.getValue("amount") as number
        return (
          <div className={cn("truncate text-sm font-medium text-right", getAmountColorClass(amount))}>
            {monetary.formatMonetaryValue(amount)}
          </div>
        )
      },
      size: 110,
      minSize: 100,
    },
    {
      id: "account",
      accessorFn: (row) => row.account.name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={labels.account} />
      ),
      cell: ({ row }) => (
        <div className="truncate text-sm">{resolveAccountLabel(t, row.original.account)}</div>
      ),
      filterFn: multiSelectFilter as FilterFn<SerializedTransaction>,
      size: 150,
      minSize: 80,
      meta: { responsive: "hide-mobile" },
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={labels.status} />
      ),
      cell: ({ row }) => {
        const status = row.getValue("status") as string
        const config = statusConfig[status]
        if (!config) return null
        return (
          <div className="flex items-center justify-center md:justify-start">
            <div className="hidden md:block">
              <Badge variant="outline" className={cn("text-xs", config.className)}>
                {config.label}
              </Badge>
            </div>
            <div className="block md:hidden">
              <StatusDot status={status as any} />
            </div>
          </div>
        )
      },
      filterFn: multiSelectFilter as FilterFn<SerializedTransaction>,
      sortingFn: statusSortFn,
      // Ordenada por padrão (DEFAULT_SORTING): o ícone de ordenação custa 20px no rótulo.
      size: 108,
      minSize: 108,
    },
    {
      id: "type",
      accessorFn: (row) => row.type,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={labels.type} />
      ),
      cell: ({ row }) => {
        const type = row.original.type
        const config = typeConfig[type]
        return <div className={cn("truncate text-sm", config.className)}>{config.label}</div>
      },
      filterFn: multiSelectFilter as FilterFn<SerializedTransaction>,
      size: 100,
    },
    {
      id: "actions",
      header: () => <div className="text-right">{labels.actions}</div>,
      cell: ({ row, table }) => {
        const meta = table.options.meta as TransactionTableMeta | undefined

        return (
          <div className="flex justify-end">
            <TransactionActions
              transaction={row.original}
              onQuickPay={(tx) => meta?.onQuickPayTransaction?.(tx)}
              onEdit={(tx) => meta?.onEditTransaction?.(tx)}
              onCopy={(tx) => meta?.onCopyTransaction?.(tx)}
              onMakeRecurring={(tx) => meta?.onMakeRecurring?.(tx)}
              onAttachments={(tx) => meta?.onOpenAttachments?.(tx)}
              onNotes={(tx) => meta?.onOpenNotes?.(tx)}
              onDelete={(tx) => meta?.onDeleteTransaction?.(tx)}
            />
          </div>
        )
      },
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      // Coluna fixa: precisa caber o rótulo mais longo dos 3 idiomas ("ACCIONES") com folga
      // à direita; o menu "⋮" alinha à direita dentro dela.
      minSize: 104,
      size: 104,
    },
    {
      id: "payee",
      accessorFn: (row) => row.payee?.name ?? "",
      header: ({ column }) => <DataTableColumnHeader column={column} title={labels.payee} />,
      cell: ({ row }) => (
        <div className="truncate text-sm text-muted-foreground">
          {row.original.payee?.name || "—"}
        </div>
      ),
      size: 150,
    },
  ]
}
