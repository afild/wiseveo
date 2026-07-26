"use client"

import { type Table } from "@tanstack/react-table"
import { RefreshCcw, Filter } from "lucide-react"
import { useTranslations } from "next-intl"
import { useDeviceClass } from "@/hooks/use-device-class"

import { DataTableFacetedFilter } from "@/components/data-table/data-table-faceted-filter"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet"

import type { TransactionFilterOptions } from "../types"

interface DataTableToolbarProps<TData> {
  table: Table<TData>
  filterOptions: TransactionFilterOptions
}

export function DataTableToolbar<TData>({
  table,
  filterOptions,
}: DataTableToolbarProps<TData>) {
  const { isMobile } = useDeviceClass()
  const t = useTranslations("transactions.filters")
  const tColumns = useTranslations("transactions.columns")

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

  const isFiltered =
    table.getState().columnFilters.length > 0 || !!table.getState().globalFilter

  // Os filtros gravam SEMPRE arrays (contrato do multiSelectFilter). No mobile o
  // Select continua de escolha única — grava um array de um item e lê o primeiro.
  const handleFilterChange = (columnId: string, value: string) => {
    const column = table.getColumn(columnId)
    column?.setFilterValue(value === "all" ? undefined : [value])
  }

  const readSingle = (columnId: string) =>
    ((table.getColumn(columnId)?.getFilterValue() as string[] | undefined) ?? [])[0]

  if (isMobile) {
    return (
      <div className="flex items-center gap-2">
        <Input
          placeholder={t("searchPlaceholderMobile")}
          value={table.getState().globalFilter ?? ""}
          onChange={(event) => table.setGlobalFilter(event.target.value)}
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
                <span className="text-sm font-medium">{t("statusFieldLabel")}</span>
                <Select
                  value={readSingle("status") || "all"}
                  onValueChange={(v) => handleFilterChange("status", v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("statusFieldLabel")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("allStatuses")}</SelectItem>
                    {filterOptions.statuses.map((status) => (
                      <SelectItem key={status} value={status}>
                        {statusLabels[status] || status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <span className="text-sm font-medium">{t("typeFieldLabel")}</span>
                <Select
                  value={readSingle("type") || "all"}
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

              <div className="space-y-2">
                <span className="text-sm font-medium">{t("accountFieldLabel")}</span>
                <Select
                  value={readSingle("account") || "all"}
                  onValueChange={(v) => handleFilterChange("account", v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("accountFieldLabel")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("allAccounts")}</SelectItem>
                    {filterOptions.accounts.map((account) => (
                      <SelectItem key={account.id} value={account.name}>
                        {account.name}
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
                onClick={() => {
                  table.resetColumnFilters()
                  table.setGlobalFilter("")
                }}
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
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder={t("searchPlaceholderDesktop")}
        value={table.getState().globalFilter ?? ""}
        onChange={(event) => table.setGlobalFilter(event.target.value)}
        className="h-9 w-[200px] lg:w-[280px] cursor-text"
      />
      <DataTableFacetedFilter
        column={table.getColumn("status")}
        title={t("statusFieldLabel")}
        options={filterOptions.statuses.map((s) => ({
          value: s,
          label: statusLabels[s] || s,
        }))}
      />
      <DataTableFacetedFilter
        column={table.getColumn("type")}
        title={t("typeFieldLabel")}
        options={filterOptions.types.map((v) => ({
          value: v,
          label: typeLabels[v] || v,
        }))}
      />
      <DataTableFacetedFilter
        column={table.getColumn("account")}
        title={t("accountFieldLabel")}
        options={filterOptions.accounts.map((a) => ({ value: a.name, label: a.name }))}
      />
      {isFiltered && (
        <Button
          variant="ghost"
          onClick={() => {
            table.resetColumnFilters()
            table.setGlobalFilter("")
          }}
          className="text-muted-foreground h-9 px-2 cursor-pointer"
        >
          <RefreshCcw className="size-4" />
          <span className="hidden lg:inline">{t("clearFiltersButton")}</span>
        </Button>
      )}
    </div>
  )
}
