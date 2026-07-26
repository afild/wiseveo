"use client"

import * as React from "react"
import type { Table } from "@tanstack/react-table"
import { Download, FileText, Loader2, Settings2 } from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { ExportFormat } from "@/lib/table-export"

interface DataTableToolsMenuProps<TData> {
  table: Table<TData>
  columnLabels: Record<string, string>
  onExport: (format: ExportFormat) => void | Promise<void>
  onPrint?: () => void | Promise<void>
}

export function DataTableToolsMenu<TData>({
  table,
  columnLabels,
  onExport,
  onPrint,
}: DataTableToolsMenuProps<TData>) {
  const t = useTranslations("common.dataTable")
  const [busy, setBusy] = React.useState(false)

  const run = async (fn: () => void | Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-2 cursor-pointer">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Settings2 className="size-4" />}
          <span className="hidden lg:inline">{t("tools.button")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="cursor-pointer">
            {t("tools.columns")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuLabel>{t("tools.columnsLabel")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {table
              .getAllColumns()
              .filter((c) => typeof c.accessorFn !== "undefined" && c.getCanHide())
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  className="cursor-pointer"
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) => column.toggleVisibility(!!value)}
                >
                  {columnLabels[column.id] ?? column.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="cursor-pointer">
            <Download className="mr-2 size-4" />
            {t("export.label")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            <DropdownMenuItem className="cursor-pointer" onSelect={() => void run(() => onExport("csv"))}>
              {t("export.csv")}
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer" onSelect={() => void run(() => onExport("xlsx"))}>
              {t("export.excel")}
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer" onSelect={() => void run(() => onExport("json"))}>
              {t("export.json")}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {onPrint && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer" onSelect={() => void run(onPrint)}>
              <FileText className="mr-2 size-4" />
              {t("print")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
