"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Play, Trash2, Pencil, RotateCcw, Filter } from "lucide-react"
import { useDeviceClass } from "@/hooks/use-device-class"
import type { Table } from "@tanstack/react-table"

import { Button } from "@/components/ui/button"
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
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
    SheetFooter,
    SheetClose,
} from "@/components/ui/sheet"
import { DetailPanel } from "@/components/detail-panel"
import { DataTableViewOptions } from "@/features/transactions/components/data-table-view-options"
import type { RecurringFilterOptions } from "../types"

interface DataTableToolbarProps<TData> {
    table: Table<TData>
    filterOptions: RecurringFilterOptions
    onLaunchSelected?: (rows: TData[]) => Promise<boolean>
    onEditSelectedDate?: (rows: TData[], date: string) => Promise<boolean>
    onDeleteSelected?: (rows: TData[]) => Promise<boolean>
    batchLoading?: boolean
}

export function DataTableToolbar<TData>({
    table,
    filterOptions,
    onLaunchSelected,
    onEditSelectedDate,
    onDeleteSelected,
    batchLoading,
}: DataTableToolbarProps<TData>) {
    const { isMobile } = useDeviceClass()
    const t = useTranslations("recurring.filters")
    const tBatch = useTranslations("recurring.batch")
    const tColumns = useTranslations("recurring.columns")
    const tCommon = useTranslations("common")

    const typeLabels: Record<string, string> = {
        INCOME: tColumns("typeIncome"),
        EXPENSE: tColumns("typeExpense"),
        TRANSFER: tColumns("typeTransfer"),
    }

    const isFiltered = table.getState().columnFilters.length > 0
    const selectedRows = table.getFilteredSelectedRowModel().rows
    const selectedData = selectedRows.map((row) => row.original)
    const [showLaunchConfirm, setShowLaunchConfirm] = React.useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false)
    const [showEditDateDialog, setShowEditDateDialog] = React.useState(false)
    const [selectedDate, setSelectedDate] = React.useState(
        new Date().toISOString().split("T")[0]
    )

    const handleFilterChange = (columnId: string, value: string) => {
        const column = table.getColumn(columnId)
        if (value === "all") {
            column?.setFilterValue(undefined)
        } else {
            column?.setFilterValue(value)
        }
    }

    const typeFilter = table.getColumn("type")?.getFilterValue() as string | undefined

    const handleLaunch = async () => {
        if (!onLaunchSelected || selectedData.length === 0) return
        const ok = await onLaunchSelected(selectedData)
        if (ok) {
            table.resetRowSelection()
            setShowLaunchConfirm(false)
        }
    }

    const handleEditDate = async () => {
        if (!onEditSelectedDate || selectedData.length === 0 || !selectedDate) return
        const ok = await onEditSelectedDate(selectedData, selectedDate)
        if (ok) {
            table.resetRowSelection()
            setShowEditDateDialog(false)
        }
    }

    const handleDelete = async () => {
        if (!onDeleteSelected || selectedData.length === 0) return
        const ok = await onDeleteSelected(selectedData)
        if (ok) {
            table.resetRowSelection()
            setShowDeleteConfirm(false)
        }
    }

    return (
        <div className="flex flex-col gap-4">
            {isMobile ? (
                <div className="flex items-center gap-2">
                    <Input
                        placeholder={t("searchPlaceholderMobile")}
                        value={(table.getColumn("description")?.getFilterValue() as string) ?? ""}
                        onChange={(event) =>
                            table.getColumn("description")?.setFilterValue(event.target.value)
                        }
                        className="flex-1 h-9"
                    />

                    <Sheet>
                        <SheetTrigger asChild>
                            <Button variant="outline" size="sm" className="h-9 gap-2">
                                <Filter className="h-4 w-4" />
                                <span className="text-xs">{t("filtersButton")}</span>
                                {table.getState().columnFilters.length > 0 && (
                                    <span className="bg-primary text-primary-foreground flex h-4 w-4 items-center justify-center rounded-full text-[10px]">
                                        {table.getState().columnFilters.length}
                                    </span>
                                )}
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="bottom" className="px-6 pb-8">
                            <SheetHeader>
                                <SheetTitle>{t("filterSheetTitle")}</SheetTitle>
                            </SheetHeader>
                            <div className="grid gap-4 py-4">
                                <div className="space-y-2">
                                    <span className="text-sm font-medium">{t("typeFieldLabel")}</span>
                                    <Select
                                        value={typeFilter || "all"}
                                        onValueChange={(v) => handleFilterChange("type", v)}
                                    >
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder={t("typeFieldLabel")} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">{t("allTypes")}</SelectItem>
                                            {filterOptions.types.map((type) => (
                                                <SelectItem key={type} value={type}>
                                                    {typeLabels[type] || type}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <SheetFooter className="flex flex-row gap-2 pt-2">
                                <Button
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() => table.resetColumnFilters()}
                                    disabled={!isFiltered}
                                >
                                    {t("clear")}
                                </Button>
                                <SheetClose asChild>
                                    <Button className="flex-1">{t("apply")}</Button>
                                </SheetClose>
                            </SheetFooter>
                        </SheetContent>
                    </Sheet>
                </div>
            ) : (
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex flex-1 items-center gap-2">
                        <Input
                            placeholder={t("searchPlaceholderDesktop")}
                            value={(table.getColumn("description")?.getFilterValue() as string) ?? ""}
                            onChange={(event) =>
                                table.getColumn("description")?.setFilterValue(event.target.value)
                            }
                            className="h-9 w-[200px] lg:w-[300px]"
                        />

                        <Select
                            value={typeFilter || "all"}
                            onValueChange={(v) => handleFilterChange("type", v)}
                        >
                            <SelectTrigger className="h-9 w-[150px] cursor-pointer">
                                <SelectValue placeholder={t("typeFieldLabel")} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all" className="cursor-pointer">{t("allTypes")}</SelectItem>
                                {filterOptions.types.map((type) => (
                                    <SelectItem key={type} value={type} className="cursor-pointer">
                                        {typeLabels[type] || type}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {isFiltered && (
                            <Button
                                variant="ghost"
                                onClick={() => table.resetColumnFilters()}
                                className="h-9 px-2 lg:px-3 text-muted-foreground"
                            >
                                <RotateCcw className="mr-2 h-4 w-4" />
                                {t("clear")}
                            </Button>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2">
                            <DataTableViewOptions table={table} />
                        </div>
                    </div>
                </div>
            )}

            {selectedRows.length > 0 && (
                <div className="bg-primary/5 border-primary/20 flex items-center justify-between rounded-lg border px-3 py-2 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="flex items-center gap-4">
                        <span className="text-primary text-sm font-semibold">
                            {tBatch("selectedCount", { count: selectedRows.length })}
                        </span>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="text-positive border-positive/30 hover:bg-positive/10 h-8 gap-2"
                                title={tBatch("launchTooltip")}
                                disabled={batchLoading}
                                onClick={() => setShowLaunchConfirm(true)}
                            >
                                <Play className="h-4 w-4" />
                                {tBatch("launch")}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 gap-2"
                                title={tBatch("editDateTooltip")}
                                disabled={batchLoading}
                                onClick={() => setShowEditDateDialog(true)}
                            >
                                <Pencil className="h-4 w-4" />
                                {tBatch("editDate")}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="text-destructive border-destructive/30 hover:bg-destructive/10 h-8 gap-2"
                                title={tBatch("deleteTooltip")}
                                disabled={batchLoading}
                                onClick={() => setShowDeleteConfirm(true)}
                            >
                                <Trash2 className="h-4 w-4" />
                                {tBatch("delete")}
                            </Button>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => table.resetRowSelection()}
                        className="text-muted-foreground h-8"
                    >
                        {tCommon("cancel")}
                    </Button>
                </div>
            )}

            <AlertDialog open={showLaunchConfirm} onOpenChange={setShowLaunchConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{tBatch("launchTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {tBatch("launchDescription", { count: selectedRows.length })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={batchLoading}>{tCommon("cancel")}</AlertDialogCancel>
                        <AlertDialogAction disabled={batchLoading} onClick={() => void handleLaunch()}>
                            {batchLoading ? tBatch("launching") : tBatch("launch")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <DetailPanel
                open={showEditDateDialog}
                onOpenChange={setShowEditDateDialog}
                title={tBatch("editDateTitle")}
                description={tBatch("editDateDescription", { count: selectedRows.length })}
                className="space-y-4"
                footer={
                    <>
                        <Button
                            variant="outline"
                            onClick={() => setShowEditDateDialog(false)}
                            disabled={batchLoading}
                        >
                            {tCommon("cancel")}
                        </Button>
                        <Button
                            onClick={() => void handleEditDate()}
                            disabled={batchLoading || !selectedDate}
                        >
                            {batchLoading ? tBatch("saving") : tBatch("saveDate")}
                        </Button>
                    </>
                }
            >
                <p className="text-muted-foreground text-sm">
                    {tBatch("editDateDescription", { count: selectedRows.length })}
                </p>
                <div className="space-y-2">
                    <Label htmlFor="batch-recurring-date">{tBatch("dateLabel")}</Label>
                    <Input
                        id="batch-recurring-date"
                        type="date"
                        value={selectedDate}
                        onChange={(event) => setSelectedDate(event.target.value)}
                    />
                </div>
            </DetailPanel>

            <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{tBatch("deleteTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {tBatch("deleteDescription", { count: selectedRows.length })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={batchLoading}>{tCommon("cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={batchLoading}
                            onClick={() => void handleDelete()}
                        >
                            {batchLoading ? tBatch("deleting") : tBatch("delete")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
