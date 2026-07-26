"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
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

import { DraggableTableHead } from "@/components/data-table/draggable-table-head"
import {
    Table,
    TableBody,
    TableCell,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

/** Colunas que não arrastam: a de seleção abre a linha, a de ações fecha. */
const FIXED_COLUMNS = ["select", "actions"]

import { DataTablePagination } from "../../transactions/components/data-table-pagination"
import { useRecurringColumnLabels } from "./columns"
import { DataTableToolbar } from "./data-table-toolbar"
import type { RecurringFilterOptions, SerializedRecurringTransaction } from "../types"
import { useDeviceClass } from "@/hooks/use-device-class"
import { useMonetaryFormattingSafe } from "@/hooks/use-monetary-formatting"
import { createDateFormatter, formatAppDate } from "@/i18n/format"
import { formatPeriod } from "@/lib/financial"
import { mergeColumnOrder, type ExportFormat } from "@/lib/table-export"
import { cn } from "@/lib/utils"
import { RecurringCardMobile } from "./recurring-card-mobile"

interface DataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[]
    data: TData[]
    filterOptions: RecurringFilterOptions
    loading?: boolean
    onLaunchRecurring?: (recurring: SerializedRecurringTransaction) => void
    onEditRecurring?: (recurring: SerializedRecurringTransaction) => void
    onDeleteRecurring?: (recurring: SerializedRecurringTransaction) => void
    onLaunchSelectedRecurring?: (items: SerializedRecurringTransaction[]) => Promise<boolean>
    onEditSelectedRecurringDate?: (items: SerializedRecurringTransaction[], date: string) => Promise<boolean>
    onDeleteSelectedRecurring?: (items: SerializedRecurringTransaction[]) => Promise<boolean>
    batchLoading?: boolean
}

export function DataTable<TData, TValue>({
    columns,
    data,
    filterOptions,
    loading,
    onLaunchRecurring,
    onEditRecurring,
    onDeleteRecurring,
    onLaunchSelectedRecurring,
    onEditSelectedRecurringDate,
    onDeleteSelectedRecurring,
    batchLoading,
}: DataTableProps<TData, TValue>) {
    const { isMobile } = useDeviceClass()
    const locale = useLocale()
    const monetary = useMonetaryFormattingSafe()
    const t = useTranslations("recurring.table")
    const tCommon = useTranslations("common")
    const tDataTable = useTranslations("common.dataTable")
    const tColumns = useTranslations("recurring.columns")
    const columnLabels = useRecurringColumnLabels()
    const [rowSelection, setRowSelection] = React.useState({})
    const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
    const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
    const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({})
    const [columnOrder, setColumnOrder] = React.useState<string[]>([])
    const [sorting, setSorting] = React.useState<SortingState>([])

    const allColumnIds = React.useMemo(
        () =>
            columns.map(
                (c) => c.id ?? (c as { accessorKey?: string }).accessorKey ?? ""
            ),
        [columns]
    )

    const isLoadingStorage = React.useRef(true)

    // Load from local storage on mount
    React.useEffect(() => {
        try {
            // v2: os filtros passaram de string única para array (multi-seleção). O formato
            // antigo quebraria o multiSelectFilter, então a chave anterior é descartada.
            localStorage.removeItem('wiseveo-recurring-filters');
            const savedFilters = localStorage.getItem('wiseveo-recurring-filters-v2');
            if (savedFilters) setColumnFilters(JSON.parse(savedFilters));

            const savedSorting = localStorage.getItem('wiseveo-recurring-sorting');
            if (savedSorting) setSorting(JSON.parse(savedSorting));

            const savedVisibility = localStorage.getItem('wiseveo-recurring-visibility');
            if (savedVisibility) setColumnVisibility(JSON.parse(savedVisibility));

            const savedSizing = localStorage.getItem('wiseveo-recurring-sizing');
            if (savedSizing) setColumnSizing(JSON.parse(savedSizing));

            const savedOrder = localStorage.getItem('wiseveo-recurring-order');
            if (savedOrder) {
                setColumnOrder(mergeColumnOrder(JSON.parse(savedOrder), allColumnIds));
            }
        } catch (e) {
            console.error('Failed to parse recurring table settings', e);
        } finally {
            isLoadingStorage.current = false;
        }
    }, []);

    // Save to local storage when state changes
    React.useEffect(() => {
        if (isLoadingStorage.current) return;
        localStorage.setItem('wiseveo-recurring-filters-v2', JSON.stringify(columnFilters));
    }, [columnFilters]);

    React.useEffect(() => {
        if (isLoadingStorage.current) return;
        localStorage.setItem('wiseveo-recurring-sorting', JSON.stringify(sorting));
    }, [sorting]);

    React.useEffect(() => {
        if (isLoadingStorage.current) return;
        localStorage.setItem('wiseveo-recurring-visibility', JSON.stringify(columnVisibility));
    }, [columnVisibility]);

    React.useEffect(() => {
        if (isLoadingStorage.current) return;
        localStorage.setItem('wiseveo-recurring-sizing', JSON.stringify(columnSizing));
    }, [columnSizing]);

    React.useEffect(() => {
        if (isLoadingStorage.current) return;
        localStorage.setItem('wiseveo-recurring-order', JSON.stringify(columnOrder));
    }, [columnOrder]);

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
            return arrayMove(
                current,
                current.indexOf(String(active.id)),
                current.indexOf(String(over.id))
            )
        })
    }

    const table = useReactTable({
        data,
        columns,
        defaultColumn: { minSize: 64, size: 150, maxSize: 480 },
        columnResizeMode: "onChange",
        meta: {
            onLaunchRecurring,
            onEditRecurring,
            onDeleteRecurring,
        },
        state: {
            sorting,
            columnVisibility,
            rowSelection,
            columnFilters,
            columnSizing,
            columnOrder,
        },
        enableRowSelection: true,
        onColumnOrderChange: setColumnOrder,
        onColumnSizingChange: setColumnSizing,
        onRowSelectionChange: setRowSelection,
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        onColumnVisibilityChange: setColumnVisibility,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFacetedRowModel: getFacetedRowModel(),
        getFacetedUniqueValues: getFacetedUniqueValues(),
    })

    // Espelha a formatação das células de columns.tsx: o que o usuário vê é o que ele exporta.
    const formatCellForExport = React.useCallback(
        (columnId: string, row: Row<TData>): string => {
            const typeLabels: Record<string, string> = {
                INCOME: tColumns("typeIncome"),
                EXPENSE: tColumns("typeExpense"),
                TRANSFER: tColumns("typeTransfer"),
            }

            switch (columnId) {
                case "amount":
                    return monetary.formatMonetaryValue(row.getValue("amount") as number)
                case "lastDate": {
                    const dateStr = row.getValue("lastDate") as string | null
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
            await generateTableReport({
                brand: "WISEVEO", // i18n-ignore — nome da marca, não é texto de UI traduzível
                title: t("printTitle"),
                // Recorrentes não têm recorte de período — a tabela é sempre integral.
                periodLine: undefined,
                generatedAtLine: tDataTable("pdf.generatedAt", {
                    date: formatAppDate(new Date(), "dd/MM/yyyy", locale),
                }),
                rowsCountLine: tDataTable("pdf.rows", { count: rows.length }),
                pageOfTemplate: tDataTable.raw("pdf.pageOf") as string,
                columns: cols,
                rows,
                numericColumnIds: ["amount"],
            })
        } catch {
            toast.error(tDataTable("pdf.error"))
        }
    }, [buildExport, t, tDataTable, locale])

    return (
        <div className="flex flex-col gap-4">
            <DataTableToolbar
                table={table}
                filterOptions={filterOptions}
                columnLabels={columnLabels}
                onExport={handleExport}
                onPrint={handlePrint}
                onLaunchSelected={onLaunchSelectedRecurring as ((rows: TData[]) => Promise<boolean>) | undefined}
                onEditSelectedDate={onEditSelectedRecurringDate as ((rows: TData[], date: string) => Promise<boolean>) | undefined}
                onDeleteSelected={onDeleteSelectedRecurring as ((rows: TData[]) => Promise<boolean>) | undefined}
                batchLoading={batchLoading}
            />
            {isMobile ? (
                <div className="flex flex-col gap-3">
                    {loading ? (
                        <div className="h-24 flex items-center justify-center text-muted-foreground">
                            {tCommon("loading")}
                        </div>
                    ) : table.getRowModel().rows?.length ? (
                        table.getRowModel().rows.map((row) => (
                            <RecurringCardMobile
                                key={row.id}
                                recurring={row.original as SerializedRecurringTransaction}
                                onLaunch={onLaunchRecurring}
                                onEdit={onEditRecurring}
                                onDelete={onDeleteRecurring}
                            />
                        ))
                    ) : (
                        <div className="h-24 flex items-center justify-center text-muted-foreground">
                            {t("noResults")}
                        </div>
                    )}
                </div>
            ) : (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    modifiers={[restrictToHorizontalAxis]}
                    onDragEnd={handleDragEnd}
                >
                <div className="overflow-x-auto rounded-lg border">
                    <Table
                        className="table-fixed"
                        style={{ width: table.getCenterTotalSize(), minWidth: "100%" }}
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
                                        {headerGroup.headers.map((header) => (
                                            <DraggableTableHead
                                                key={header.id}
                                                header={header}
                                                fixed={FIXED_COLUMNS.includes(header.column.id)}
                                            >
                                                {header.isPlaceholder
                                                    ? null
                                                    : flexRender(
                                                        header.column.columnDef.header,
                                                        header.getContext()
                                                    )}
                                            </DraggableTableHead>
                                        ))}
                                    </SortableContext>
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
                                    <TableRow
                                        key={row.id}
                                        data-state={row.getIsSelected() && "selected"}
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <TableCell key={cell.id} style={{ width: cell.column.getSize() }}>
                                                {flexRender(
                                                    cell.column.columnDef.cell,
                                                    cell.getContext()
                                                )}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell
                                        colSpan={columns.length}
                                        className="h-24 text-center text-muted-foreground"
                                    >
                                        {t("noResults")}
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
