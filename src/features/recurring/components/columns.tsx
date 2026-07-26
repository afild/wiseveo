"use client"

import type { ColumnDef, FilterFn, Row } from "@tanstack/react-table"
import { useTranslations } from "next-intl"

import { Checkbox } from "@/components/ui/checkbox"
import { formatPeriod } from "@/lib/financial"
import type { MonetaryFormatter } from "@/lib/monetary"
import { multiSelectFilter } from "@/lib/table-export"
import { cn } from "@/lib/utils"
import { createDateFormatter } from "@/i18n/format"

import type { SerializedRecurringTransaction, RecurringTableMeta } from "../types"
import { DataTableColumnHeader } from "../../transactions/components/data-table-column-header"
import { RecurringActions } from "./recurring-actions"

export interface RecurringColumnLabels {
  account: string
  actions: string
  amount: string
  category: string
  description: string
  group: string
  lastLaunch: string
  note: string
  period: string
  reference: string
  selectAllAria: string
  selectRowAria: string
  type: string
  typeExpense: string
  typeIncome: string
  typeTransfer: string
}

/** Rótulos legíveis por id de coluna — usados pelo menu Ferramentas e pela exportação. */
export function useRecurringColumnLabels(): Record<string, string> {
  const t = useTranslations("recurring.columns")
  return {
    account: t("account"),
    amount: t("amount"),
    category: t("category"),
    description: t("description"),
    group: t("group"),
    lastDate: t("lastLaunch"),
    note: t("note"),
    period: t("period"),
    reference: t("reference"),
    type: t("type"),
  }
}

function buildTypeConfig(
  labels: RecurringColumnLabels
): Record<string, { label: string; className: string }> {
  return {
    INCOME: { label: labels.typeIncome, className: "text-positive" },
    EXPENSE: { label: labels.typeExpense, className: "text-destructive" },
    TRANSFER: { label: labels.typeTransfer, className: "text-muted-foreground" },
  }
}

type RecurringColumnFormatter = Pick<
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
  monetary: RecurringColumnFormatter,
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

export function createRecurringFilter(
  monetary: RecurringColumnFormatter,
  labels: RecurringColumnLabels,
  locale: string,
) {
  const typeConfig = buildTypeConfig(labels)
  const dateFormatter = createDateFormatter(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  })

  return (
    row: Row<SerializedRecurringTransaction>,
    _columnId: string,
    filterValue: string,
  ) => {
    const search = filterValue.toLowerCase().trim()
    if (!search) return true

    const note = (row.getValue("note") as string)?.toLowerCase() || ""
    const description = (row.getValue("description") as string)?.toLowerCase() || ""
    const reference = (row.original.reference || "").toLowerCase()
    const period = row.original.period.toLowerCase()
    const formattedPeriod =
      row.original.period.length === 6
        ? formatPeriod(row.original.period).toLowerCase()
        : ""
    const group = (row.original.category.group.name || "").toLowerCase()
    const category = (row.original.category.name || "").toLowerCase()
    const account = (row.original.account.name || "").toLowerCase()
    const status = (row.original.status.name || "").toLowerCase()
    const translatedType = typeConfig[row.original.type]?.label.toLowerCase() || ""

    const lastDate = row.getValue("lastDate") as string | null
    const formattedDate = lastDate
      ? dateFormatter.format(new Date(lastDate)).toLowerCase()
      : ""

    const amountMatches = matchesAmountSearch(row.original.amount, search, monetary)

    return (
      note.includes(search) ||
      description.includes(search) ||
      reference.includes(search) ||
      period.includes(search) ||
      formattedPeriod.includes(search) ||
      group.includes(search) ||
      category.includes(search) ||
      account.includes(search) ||
      status.includes(search) ||
      translatedType.includes(search) ||
      formattedDate.includes(search) ||
      amountMatches
    )
  }
}

export function getRecurringColumns(
  monetary: RecurringColumnFormatter,
  labels: RecurringColumnLabels,
  locale: string,
): ColumnDef<SerializedRecurringTransaction>[] {
  const recurringFilter = createRecurringFilter(monetary, labels, locale)
  const typeConfig = buildTypeConfig(labels)
  const dateFormatter = createDateFormatter(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  })

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
    },
    {
      accessorKey: "lastDate",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={labels.lastLaunch} />
      ),
      cell: ({ row }) => {
        const dateStr = row.getValue("lastDate") as string | null
        return (
          <div className="w-[110px] text-sm">
            {dateStr ? dateFormatter.format(new Date(dateStr)) : "—"}
          </div>
        )
      },
    },
    {
      accessorKey: "period",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={labels.period} />
      ),
      cell: ({ row }) => {
        const period = (row.getValue("period") as string | null) ?? ""
        const formatted = period.length === 6 ? formatPeriod(period) : "—"
        return <div className="w-[80px] text-sm tabular-nums">{formatted}</div>
      },
    },
    {
      accessorKey: "reference",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={labels.reference} />
      ),
      cell: ({ row }) => (
        <div className="max-w-[140px] truncate text-sm">
          {row.getValue("reference") || "—"}
        </div>
      ),
    },
    {
      accessorKey: "note",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={labels.note} />
      ),
      cell: ({ row }) => (
        <div className="max-w-[220px] truncate text-sm">
          {row.getValue("note") || "—"}
        </div>
      ),
    },
    {
      accessorKey: "description",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={labels.description} />
      ),
      cell: ({ row }) => (
        <div className="max-w-[260px] truncate text-sm">
          {row.getValue("description") || "—"}
        </div>
      ),
      filterFn: recurringFilter,
    },
    {
      id: "group",
      accessorFn: (row) => row.category.group.name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={labels.group} />
      ),
      cell: ({ row }) => (
        <div className="max-w-[160px] truncate text-sm">{row.original.category.group.name}</div>
      ),
    },
    {
      id: "category",
      accessorFn: (row) => row.category.name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={labels.category} />
      ),
      cell: ({ row }) => (
        <div className="max-w-[180px] truncate text-sm">{row.original.category.name}</div>
      ),
    },
    {
      accessorKey: "amount",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={labels.amount} />
      ),
      cell: ({ row }) => {
        const amount = row.getValue("amount") as number
        const type = row.original.type
        const colorClass =
          type === "INCOME"
            ? "text-positive"
            : type === "EXPENSE"
              ? "text-destructive"
              : "text-muted-foreground"
        return (
          <div className={cn("text-sm font-medium text-right", colorClass)}>
            {monetary.formatMonetaryValue(amount)}
          </div>
        )
      },
    },
    {
      id: "account",
      accessorFn: (row) => row.account.name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={labels.account} />
      ),
      cell: ({ row }) => (
        <div className="text-sm">{row.original.account.name}</div>
      ),
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
        return <div className={cn("text-sm", config.className)}>{config.label}</div>
      },
      filterFn: multiSelectFilter as FilterFn<SerializedRecurringTransaction>,
    },
    {
      id: "actions",
      header: () => <div className="text-right">{labels.actions}</div>,
      cell: ({ row, table }) => {
        const meta = table.options.meta as RecurringTableMeta | undefined
        return (
          <div className="flex justify-end">
            <RecurringActions
              recurring={row.original}
              onLaunch={(recurring) => meta?.onLaunchRecurring?.(recurring)}
              onEdit={(recurring) => meta?.onEditRecurring?.(recurring)}
              onDelete={(recurring) => meta?.onDeleteRecurring?.(recurring)}
            />
          </div>
        )
      },
      enableSorting: false,
      enableHiding: false,
    },
  ]
}
