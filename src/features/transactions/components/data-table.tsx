"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers"
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable"
import {
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnSizingState,
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
import { DraggableTableHead } from "@/components/data-table/draggable-table-head"
import {
  applyFittedResize,
  getFittedColumnLayout,
  useContainerWidth,
} from "@/components/data-table/use-fitted-column-sizing"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
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
import { createDateFormatter, formatAppDate } from "@/i18n/format"
import { formatPeriod } from "@/lib/financial"
import type { MonetaryFormatter } from "@/lib/monetary"
import { mergeColumnOrder, type ExportFormat } from "@/lib/table-export"
import { cn } from "@/lib/utils"

/** Colunas que não arrastam: a de seleção abre a linha, a de ações fecha. */
const FIXED_COLUMNS = ["select", "actions"]

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
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({})
  const [columnOrder, setColumnOrder] = React.useState<string[]>([])
  const [sorting, setSorting] = React.useState<SortingState>(DEFAULT_SORTING)

  const allColumnIds = React.useMemo(
    () =>
      columns.map(
        (c) => c.id ?? (c as { accessorKey?: string }).accessorKey ?? ""
      ),
    [columns]
  )

  const [globalFilter, setGlobalFilter] = React.useState("")
  const isLoadingStorage = React.useRef(true)
  const previousSortingScopeKey = React.useRef(sortingScopeKey)

  React.useEffect(() => {
    try {
      // v2: os filtros passaram de string única para array (multi-seleção). O formato
      // antigo quebraria o multiSelectFilter, então a chave anterior é descartada.
      localStorage.removeItem("wiseveo-table-filters")
      const savedFilters = localStorage.getItem("wiseveo-table-filters-v2")
      if (savedFilters) setColumnFilters(JSON.parse(savedFilters))

      const savedVisibility = localStorage.getItem("wiseveo-table-visibility")
      if (savedVisibility) setColumnVisibility(JSON.parse(savedVisibility))

      const savedGlobalFilter = localStorage.getItem("wiseveo-table-global-filter")
      if (savedGlobalFilter) setGlobalFilter(savedGlobalFilter)

      const savedSizing = localStorage.getItem("wiseveo-table-sizing")
      if (savedSizing) setColumnSizing(JSON.parse(savedSizing))

      const savedOrder = localStorage.getItem("wiseveo-table-order")
      if (savedOrder) {
        setColumnOrder(mergeColumnOrder(JSON.parse(savedOrder), allColumnIds))
      }
    } catch (e) {
      console.error("Failed to parse table settings from local storage", e)
    } finally {
      isLoadingStorage.current = false
    }
  }, [])

  React.useEffect(() => {
    if (isLoadingStorage.current) return
    try {
      localStorage.setItem("wiseveo-table-filters-v2", JSON.stringify(columnFilters))
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

  React.useEffect(() => {
    if (isLoadingStorage.current) return
    try {
      localStorage.setItem("wiseveo-table-sizing", JSON.stringify(columnSizing))
    } catch (e) {
      console.error(e)
    }
  }, [columnSizing])

  React.useEffect(() => {
    if (isLoadingStorage.current) return
    try {
      localStorage.setItem("wiseveo-table-order", JSON.stringify(columnOrder))
    } catch (e) {
      console.error(e)
    }
  }, [columnOrder])

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor)
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setColumnOrder((order) => {
      const current = order.length ? order : allColumnIds
      const from = current.indexOf(String(active.id))
      const to = current.indexOf(String(over.id))
      // arrayMove com -1 remove silenciosamente o ÚLTIMO item (splice(-1, 1)),
      // movendo a coluna errada sem erro. Melhor não mexer.
      if (from === -1 || to === -1) return current
      return arrayMove(current, from, to)
    })
  }

  // Layout "cabe no contêiner": as larguras salvas são pesos; a tabela mede o contêiner
  // e distribui os px (ver use-fitted-column-sizing.ts). Sem maxSize: com poucas colunas
  // visíveis, o teto impediria preencher a largura.
  const [containerRef, containerWidth] = useContainerWidth()

  const table = useReactTable({
    data,
    columns,
    defaultColumn: { minSize: 64, size: 150 },
    columnResizeMode: "onChange",
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
      columnSizing,
      columnOrder,
      globalFilter,
    },
    enableRowSelection: true,
    onColumnOrderChange: setColumnOrder,
    // `table` é lido só quando o gesto acontece (bem depois deste render terminar).
    onColumnSizingChange: (updater) =>
      setColumnSizing((prev) =>
        applyFittedResize(
          table,
          prev,
          typeof updater === "function" ? updater(prev) : updater,
          containerWidth,
        ),
      ),
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

  const layout = getFittedColumnLayout(table, containerWidth)
  // Estado derivado durante o render (padrão do React): fora de um arraste, mantém as
  // larguras salvas iguais aos px na tela — é o que faz o arraste acompanhar o mouse 1:1.
  if (layout.normalizedSizing) setColumnSizing(layout.normalizedSizing)

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

  const handlePrint = React.useCallback(async () => {
    try {
      const { columns: cols, rows } = buildExport()
      const { generateTableReport } = await import("@/lib/pdf/generate-table-report")
      // Mesmo formatador de data que o DayRangeNavigator usa para o intervalo.
      const rangeFormatter = createDateFormatter(locale, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "UTC",
      })
      const range =
        dateRange.from.getTime() === dateRange.to.getTime()
          ? rangeFormatter.format(dateRange.from)
          : `${rangeFormatter.format(dateRange.from)} – ${rangeFormatter.format(dateRange.to)}`
      await generateTableReport({
        brand: "WISEVEO", // i18n-ignore — nome da marca, não é texto de UI traduzível
        title: t("printTitle"),
        periodLine: tDataTable("pdf.period", { range }),
        generatedAtLine: tDataTable("pdf.generatedAt", {
          date: formatAppDate(new Date(), "dd/MM/yyyy", locale),
        }),
        rowsCountLine: tDataTable("pdf.rows", { count: rows.length }),
        pageOfTemplate: tDataTable.raw("pdf.pageOf") as string,
        columns: cols,
        rows,
        numericColumnIds: ["amount", "num"],
      })
    } catch {
      toast.error(tDataTable("pdf.error"))
    }
  }, [buildExport, t, tDataTable, locale, dateRange])

  return (
    <div className="flex flex-col gap-4">
      <DataTableToolbar table={table} filterOptions={filterOptions} />
      <div className="flex flex-col items-center gap-3 md:grid md:grid-cols-3 md:items-center">
        {/* Lado Esquerdo: vazio — a faixa de lote agora é um bloco próprio, logo
            abaixo deste grid. O placeholder preserva a centralização do navegador. */}
        <div className="hidden md:block" />

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
              onPrint={handlePrint}
            />
          </div>

          {/* O rótulo some abaixo de sm; sem o aria-label o botão fica sem nome acessível. */}
          <Button
            className="h-10 w-10 sm:h-9 sm:w-auto"
            aria-label={t("addButton")}
            onClick={onAddTransaction}
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">{t("addButton")}</span>
          </Button>
        </div>
      </div>
      {selectedRows.length > 0 && (
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
      )}
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
        <DndContext
          // id fixo: sem ele o dnd-kit gera os ids de acessibilidade por contador,
          // que diverge entre servidor e cliente e quebra a hidratação.
          id="transactions-columns-dnd"
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToHorizontalAxis]}
          onDragEnd={handleDragEnd}
        >
        {/* O scroller é o wrapper do próprio <Table> (overflow-x-auto no componente base); este div
            só mede a largura disponível. A tabela ocupa 100% e só rola abaixo da soma dos
            mínimos das colunas visíveis. */}
        <div ref={containerRef} className="rounded-lg border">
          <Table
            className="table-fixed"
            style={{ minWidth: layout.tableMinWidth }}
          >
            <TableHeader className="bg-muted sticky top-0 z-10">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  <SortableContext
                    items={headerGroup.headers
                      .map((h) => h.column.id)
                      .filter((id) => !FIXED_COLUMNS.includes(id))}
                    strategy={horizontalListSortingStrategy}
                  >
                    {headerGroup.headers.map((header) => {
                      const meta = header.column.columnDef.meta as any
                      if (isMobile && meta?.responsive === "hide-mobile") return null

                      return (
                        <DraggableTableHead
                          key={header.id}
                          header={header}
                          fixed={FIXED_COLUMNS.includes(header.column.id)}
                          width={layout.widthFor(header.column.id)}
                          resizable={layout.canResize(header.column.id)}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </DraggableTableHead>
                      )
                    })}
                  </SortableContext>
                </TableRow>
              ))}
            </TableHeader>
            {/* Em table-layout: fixed só a primeira linha (o cabeçalho) define as larguras;
                as células do corpo não recebem width — só cortam o que não cabe. */}
            <TableBody>
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
                        <TableCell key={cell.id} className="overflow-hidden">
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
        </DndContext>
      )}
      <DataTablePagination table={table} />
    </div>
  )
}
