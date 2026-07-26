"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import {
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type Row,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { DataTableToolsMenu } from "@/components/data-table/data-table-tools-menu"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { DateRange } from "@/contexts/date-range-context"

import { useTransactionColumnLabels } from "./columns"
import { DataTablePagination } from "./data-table-pagination"
import { DataTableToolbar } from "./data-table-toolbar"
import { DayRangeNavigator } from "./day-range-navigator"
import { TransactionBatchActions } from "./transaction-batch-actions"
import { TransactionCardMobile } from "./transaction-card-mobile"
import type { SerializedTransaction, TransactionFilterOptions } from "../types"
import { useDeviceClass } from "@/hooks/use-device-class"
import { createDateFormatter } from "@/i18n/format"
import { formatPeriod } from "@/lib/financial"
import type { MonetaryFormatter } from "@/lib/monetary"
import type { ExportFormat } from "@/lib/table-export"

const DEFAULT_SORTING: SortingState = [
  { id: "date", desc: false },
  { id: "status", desc: false },
  { id: "note", desc: false },
]

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  filterOptions: TransactionFilterOptions
  monetary: Pick<MonetaryFormatter, "formatMonetaryValue">
  loading?: boolean
  onAddTransaction?: () => void
  onEditTransaction?: (transaction: TData) => void
  onCopyTransaction?: (transaction: TData) => void
  onDeleteTransaction?: (transaction: TData) => void
  onQuickPayTransaction?: (transaction: TData) => void
  onMakeRecurring?: (transaction: TData) => void
  onOpenAttachments?: (transaction: TData) => void
  onOpenNotes?: (transaction: TData) => void
  onQuickPaySelectedTransactions?: (items: TData[]) => Promise<boolean>
  onEditSelectedTransactionDate?: (items: TData[], date: string) => Promise<boolean>
  onEditSelectedTransactionPeriod?: (items: TData[], period: string) => Promise<boolean>
  onCopySelectedTransactions?: (items: TData[], date: string) => Promise<boolean>
  onMakeRecurringSelectedTransactions?: (items: TData[]) => Promise<boolean>
  onNotesSelectedTransactions?: (items: TData[]) => Promise<boolean>
  onDeleteSelectedTransactions?: (items: TData[]) => Promise<boolean>
  batchLoading?: boolean
  globalFilterFn?: FilterFn<TData>
  sortingScopeKey?: string
  dateRange: DateRange
  onDateRangeChange: (range: DateRange) => void
}

export function DataTable<TData extends SerializedTransaction, TValue>({
  columns,
  data,
  filterOptions,
  monetary,
  loading,
  onAddTransaction,
  onEditTransaction,
  onCopyTransaction,
  onDeleteTransaction,
  onQuickPayTransaction,
  onMakeRecurring,
  onOpenAttachments,
  onOpenNotes,
  onQuickPaySelectedTransactions,
  onEditSelectedTransactionDate,
  onEditSelectedTransactionPeriod,
  onCopySelectedTransactions,
  onMakeRecurringSelectedTransactions,
  onNotesSelectedTransactions,
  onDeleteSelectedTransactions,
  batchLoading,
  globalFilterFn,
  sortingScopeKey,
  dateRange,
  onDateRangeChange,
}: DataTableProps<TData, TValue>) {
  const { isMobile } = useDeviceClass()
  const locale = useLocale()
  const t = useTranslations("transactions.table")
  const tCommon = useTranslations("common")
  const tDataTable = useTranslations("common.dataTable")
  const tColumns = useTranslations("transactions.columns")
  const columnLabels = useTransactionColumnLabels()
  const [rowSelection, setRowSelection] = React.useState({})
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({
      type: false,
      payee: false,
    })
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [sorting, setSorting] = React.useState<SortingState>(DEFAULT_SORTING)

  const [globalFilter, setGlobalFilter] = React.useState("")
  const isLoadingStorage = React.useRef(true)
  const previousSortingScopeKey = React.useRef(sortingScopeKey)

  React.useEffect(() => {
    try {
      const savedFilters = localStorage.getItem("wiseveo-table-filters")
      if (savedFilters) setColumnFilters(JSON.parse(savedFilters))

      const savedVisibility = localStorage.getItem("wiseveo-table-visibility")
      if (savedVisibility) setColumnVisibility(JSON.parse(savedVisibility))

      const savedGlobalFilter = localStorage.getItem("wiseveo-table-global-filter")
      if (savedGlobalFilter) setGlobalFilter(savedGlobalFilter)
    } catch (e) {
      console.error("Failed to parse table settings from local storage", e)
    } finally {
      isLoadingStorage.current = false
    }
  }, [])

  React.useEffect(() => {
    if (isLoadingStorage.current) return
    try {
      localStorage.setItem("wiseveo-table-filters", JSON.stringify(columnFilters))
    } catch (e) {
      console.error(e)
    }
  }, [columnFilters])

  React.useEffect(() => {
    if (!isLoadingStorage.current && globalFilter) {
      setSorting(DEFAULT_SORTING)
    }
  }, [globalFilter])

  React.useEffect(() => {
    if (isLoadingStorage.current) return
    if (previousSortingScopeKey.current === sortingScopeKey) return
    previousSortingScopeKey.current = sortingScopeKey
    setSorting(DEFAULT_SORTING)
  }, [sortingScopeKey])

  React.useEffect(() => {
    if (isLoadingStorage.current) return
    try {
      localStorage.setItem("wiseveo-table-visibility", JSON.stringify(columnVisibility))
    } catch (e) {
      console.error(e)
    }
  }, [columnVisibility])

  React.useEffect(() => {
    if (isLoadingStorage.current) return
    try {
      localStorage.setItem("wiseveo-table-global-filter", globalFilter)
    } catch (e) {
      console.error(e)
    }
  }, [globalFilter])

  const table = useReactTable({
    data,
    columns,
    meta: {
      onEditTransaction,
      onCopyTransaction,
      onDeleteTransaction,
      onQuickPayTransaction,
      onMakeRecurring,
      onOpenAttachments,
      onOpenNotes,
    },
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      globalFilter,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: globalFilterFn,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  const selectedRows = table.getFilteredSelectedRowModel().rows
  const selectedData = selectedRows.map((row) => row.original)

  // Espelha a formatação das células de columns.tsx: o que o usuário vê é o que ele exporta.
  const formatCellForExport = React.useCallback(
    (columnId: string, row: Row<TData>): string => {
      const statusLabels: Record<string, string> = {
        PAID: tColumns("statusPaid"),
        PENDING: tColumns("statusPending"),
        OVERDUE: tColumns("statusOverdue"),
        SCHEDULED: tColumns("statusScheduled"),
      }
      const typeLabels: Record<string, string> = {
        INCOME: tColumns("typeIncome"),
        EXPENSE: tColumns("typeExpense"),
        TRANSFER: tColumns("typeTransfer"),
      }

      switch (columnId) {
        case "amount":
          return monetary.formatMonetaryValue(row.getValue("amount") as number)
        case "date": {
          const dateStr = row.getValue("date") as string | null
          if (!dateStr) return ""
          return createDateFormatter(locale, {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            timeZone: "UTC",
          }).format(new Date(dateStr))
        }
        case "period": {
          const period = (row.getValue("period") as string | null) ?? ""
          return period.length === 6 ? formatPeriod(period) : ""
        }
        case "status":
          return statusLabels[row.getValue("status") as string] ?? ""
        case "type":
          return typeLabels[row.getValue("type") as string] ?? ""
        default:
          return String(row.getValue(columnId) ?? "")
      }
    },
    [locale, monetary, tColumns]
  )

  const buildExport = React.useCallback(() => {
    const source = table.getFilteredSelectedRowModel().rows.length
      ? table.getFilteredSelectedRowModel().rows
      : table.getPrePaginationRowModel().rows // filtrado + ordenado, todas as páginas
    const cols = table
      .getVisibleLeafColumns()
      .filter((c) => c.id !== "select" && c.id !== "actions")
      .map((c) => ({ id: c.id, label: columnLabels[c.id] ?? c.id }))
    const rows = source.map((row) =>
      Object.fromEntries(cols.map((c) => [c.id, formatCellForExport(c.id, row)]))
    )
    return { columns: cols, rows }
  }, [table, columnLabels, formatCellForExport])

  const handleExport = React.useCallback(
    async (format: ExportFormat) => {
      try {
        const { columns: cols, rows } = buildExport()
        const { exportRows } = await import("@/lib/table-export")
        await exportRows(format, { columns: cols, rows, fileBaseName: t("exportFileName") })
      } catch {
        toast.error(tDataTable("export.error"))
      }
    },
    [buildExport, t, tDataTable]
  )

  return (
    <div className="flex flex-col gap-4">
      <DataTableToolbar table={table} filterOptions={filterOptions} />
      <div className="flex flex-col items-center gap-3 md:grid md:grid-cols-3 md:items-center">
        {/* Lado Esquerdo: Ações em Lote (alinhado com as checkboxes) */}
        <div className="flex w-full justify-center md:justify-start">
          <TransactionBatchActions
            selectedData={selectedData}
            selectedCount={selectedRows.length}
            batchLoading={batchLoading}
            onQuickPaySelectedTransactions={onQuickPaySelectedTransactions}
            onEditSelectedTransactionDate={onEditSelectedTransactionDate}
            onEditSelectedTransactionPeriod={onEditSelectedTransactionPeriod}
            onCopySelectedTransactions={onCopySelectedTransactions}
            onMakeRecurringSelectedTransactions={onMakeRecurringSelectedTransactions}
            onNotesSelectedTransactions={onNotesSelectedTransactions}
            onDeleteSelectedTransactions={onDeleteSelectedTransactions}
            onClearSelection={() => table.resetRowSelection()}
          />
        </div>
        
        {/* Centro: Navegador de Datas */}
        <div className="flex justify-center">
          <DayRangeNavigator dateRange={dateRange} onDateRangeChange={onDateRangeChange} />
        </div>
        
        {/* Lado Direito: Opções e Novo */}
        <div className="flex w-full items-center justify-end gap-1.5">
          <div className="hidden sm:block">
            <DataTableToolsMenu
              table={table}
              columnLabels={columnLabels}
              onExport={handleExport}
            />
          </div>

          <Button
            className="h-10 w-10 sm:h-9 sm:w-auto"
            onClick={onAddTransaction}
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">{t("addButton")}</span>
          </Button>
        </div>
      </div>
      {isMobile ? (
        <div className="flex flex-col border-t">
          {loading ? (
            <div className="flex h-24 items-center justify-center text-muted-foreground">
              {tCommon("loading")}
            </div>
          ) : table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TransactionCardMobile
                key={row.id}
                transaction={row.original as SerializedTransaction}
                isSelected={row.getIsSelected()}
                onToggleSelection={(v) => row.toggleSelected(v)}
                monetary={monetary}
                onEdit={onEditTransaction as ((tx: SerializedTransaction) => void) | undefined}
                onCopy={onCopyTransaction as ((tx: SerializedTransaction) => void) | undefined}
                onDelete={onDeleteTransaction as ((tx: SerializedTransaction) => void) | undefined}
                onQuickPay={onQuickPayTransaction as ((tx: SerializedTransaction) => void) | undefined}
                onMakeRecurring={onMakeRecurring as ((tx: SerializedTransaction) => void) | undefined}
                onAttachments={onOpenAttachments as ((tx: SerializedTransaction) => void) | undefined}
                onNotes={onOpenNotes as ((tx: SerializedTransaction) => void) | undefined}
              />
            ))
          ) : (
            <div className="flex h-24 items-center justify-center text-muted-foreground">
              {tCommon("noResults")}
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="bg-muted sticky top-0 z-10">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const meta = header.column.columnDef.meta as any
                    if (isMobile && meta?.responsive === "hide-mobile") return null

                    return (
                      <TableHead key={header.id} colSpan={header.colSpan}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody className="**:data-[slot=table-cell]:first:w-8">
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {tCommon("loading")}
                  </TableCell>
                </TableRow>
              ) : table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta as any
                      if (isMobile && meta?.responsive === "hide-mobile") return null

                      return (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {tCommon("noResults")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
      <DataTablePagination table={table} />
    </div>
  )
}
