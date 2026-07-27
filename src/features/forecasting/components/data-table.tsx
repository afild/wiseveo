import * as React from "react"
import { ChevronRight, ChevronDown } from "lucide-react"
import { useTranslations } from "next-intl"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"
import { formatPercentValue } from "@/lib/monetary"
import { useMonetaryFormattingSafe } from "@/hooks/use-monetary-formatting"
import { cn } from "@/lib/utils"
import { resolveCategoryLabel, resolveGroupLabel } from "@/i18n/chart-labels"
import type {
  ForecastingData,
  ForecastingCell,
  ForecastingSection
} from "../types"

interface ForecastingDataTableProps {
  data: ForecastingData
  showAv: boolean
  showAh: boolean
  loading: boolean
}

export function ForecastingDataTable({ data, showAv, showAh, loading }: ForecastingDataTableProps) {
  const t = useTranslations("forecasting.table")
  // Raiz do next-intl: os helpers de rotulo do plano de contas usam a chave completa.
  const tRoot = useTranslations()
  const monetary = useMonetaryFormattingSafe()
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({
    "section-income": true,
    "section-expense": true
  })

  const toggleExpand = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const renderCellMetrics = (cell: ForecastingCell) => {
    if (!showAv && !showAh) return null
    return (
      <div className="flex flex-col gap-0.5 text-[10px] text-muted-foreground mt-1 text-right">
        {showAv && <span>{t("avAbbrev")}: {formatPercentValue(cell.avPercentage)}</span>}
        {showAh && <span>{t("ahAbbrev")}: {formatPercentValue(cell.ahPercentage)}</span>}
      </div>
    )
  }

  const renderSection = (section: ForecastingSection, idPrefix: string, colorMode: "income" | "expense" | "mixed") => {
    const isExpanded = !!expanded[idPrefix]
    
    const getColorClass = (amount: number, baseOpacity: string = "") => {
      if (colorMode === "income") return `text-positive${baseOpacity}`
      if (colorMode === "expense") return `text-destructive${baseOpacity}`
      return amount >= 0 ? `text-positive${baseOpacity}` : `text-destructive${baseOpacity}`
    }

    return (
      <React.Fragment key={idPrefix}>
        <TableRow 
          className="cursor-pointer hover:bg-muted/50 bg-muted/20"
          onClick={() => toggleExpand(idPrefix)}
        >
          <TableCell className="font-semibold py-3 sticky left-0 bg-background/95 backdrop-blur z-20 w-[250px] shadow-[1px_0_0_0_var(--border)]">
            <div className="flex items-center gap-2">
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {section.name}
            </div>
          </TableCell>
          {section.cells.map((cell, idx) => (
            <TableCell key={idx} className="text-right align-top py-3 min-w-[140px]">
              <div className="flex flex-col items-end">
                <span className={cn(
                  "font-semibold tabular-nums",
                  getColorClass(cell.amount),
                  cell.isProjected && "opacity-80"
                )}>
                  {monetary.formatMonetaryValue(cell.amount)}
                </span>
                  <span className="text-[9px] uppercase text-muted-foreground">
                    {cell.isProjected ? t("projected") : t("actual")}
                  </span>
                {renderCellMetrics(cell)}
              </div>
            </TableCell>
          ))}
        </TableRow>

        {isExpanded && section.groups.map(group => {
          const groupId = `${idPrefix}-${group.code}`
          const isGroupExpanded = !!expanded[groupId]
          return (
            <React.Fragment key={groupId}>
              <TableRow 
                className="cursor-pointer hover:bg-muted/30"
                onClick={() => toggleExpand(groupId)}
              >
                <TableCell className="font-medium py-2 sticky left-0 bg-background/95 backdrop-blur z-20 w-[250px] pl-8 shadow-[1px_0_0_0_var(--border)]">
                  <div className="flex items-center gap-2">
                    {isGroupExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    {resolveGroupLabel(tRoot, group)}
                  </div>
                </TableCell>
                {group.cells.map((cell, idx) => (
                  <TableCell key={idx} className="text-right align-top py-2 text-sm">
                    <div className="flex flex-col items-end">
                      <span className={cn(
                        "tabular-nums font-medium",
                        getColorClass(cell.amount, "/90")
                      )}>
                        {monetary.formatMonetaryValue(cell.amount)}
                      </span>
                      {renderCellMetrics(cell)}
                    </div>
                  </TableCell>
                ))}
              </TableRow>

              {isGroupExpanded && group.categories.map(cat => (
                <TableRow key={`${groupId}-${cat.code}`} className="hover:bg-muted/20">
                  <TableCell className="text-sm py-2 sticky left-0 bg-background/95 backdrop-blur z-20 w-[250px] pl-14 text-muted-foreground shadow-[1px_0_0_0_var(--border)]">
                    <div className="flex items-center gap-2">
                      <div className="h-1 w-1 rounded-full bg-border" />
                      <span className="truncate max-w-[150px]" title={resolveCategoryLabel(tRoot, cat)}>
                        {resolveCategoryLabel(tRoot, cat)}
                      </span>
                    </div>
                  </TableCell>
                  {cat.cells.map((cell, idx) => (
                    <TableCell key={idx} className="text-right align-top py-2 text-sm text-muted-foreground">
                      <div className="flex flex-col items-end">
                        <span className={cn(
                          "tabular-nums",
                          getColorClass(cell.amount, "/70")
                        )}>
                          {monetary.formatMonetaryValue(cell.amount)}
                        </span>
                        {renderCellMetrics(cell)}
                      </div>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </React.Fragment>
          )
        })}
      </React.Fragment>
    )
  }

  return (
    <div className={cn("rounded-md border bg-card relative", loading && "opacity-50 pointer-events-none")}>
      <Table className="w-full">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[250px] sticky left-0 z-30 bg-background/95 backdrop-blur shadow-[1px_0_0_0_var(--border)]">
              {t("accountColumn")}
            </TableHead>
            {data.columns.map((col, i) => (
              <TableHead key={i} className="text-right min-w-[140px] z-10 bg-background/95 backdrop-blur">
                <div className="flex flex-col items-end gap-1">
                  <span className="font-semibold text-foreground">{col.label}</span>
                  <span className={cn(
                    "text-[10px] uppercase px-1.5 py-0.5 rounded-sm",
                    col.isProjected
                      ? "text-muted-foreground bg-muted"
                      : "text-positive/80 bg-positive/10"
                  )}>
                    {col.isProjected ? t("projectedAbbrev") : t("actual")}
                  </span>
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {renderSection(data.income, "section-income", "income")}
          {renderSection(data.expense, "section-expense", "expense")}

          <TableRow className="bg-primary/5">
            <TableCell className="font-bold py-4 sticky left-0 bg-background/95 backdrop-blur z-20 shadow-[1px_0_0_0_var(--border)]">
              {t("netBalance")}
            </TableCell>
            {data.netResultCells.map((cell, idx) => (
              <TableCell key={idx} className="text-right align-top py-4">
                <div className="flex flex-col items-end">
                  <span className={cn(
                    "font-bold tabular-nums text-lg",
                    cell.amount < 0 ? "text-destructive" : "text-positive",
                    cell.isProjected && "opacity-80"
                  )}>
                    {monetary.formatMonetaryValue(cell.amount)}
                  </span>
                  {renderCellMetrics(cell)}
                </div>
              </TableCell>
            ))}
          </TableRow>

          <TableRow className="bg-primary/10 border-t-2 border-dashed border-primary/30">
            <TableCell className="font-bold py-4 sticky left-0 bg-background/95 backdrop-blur z-20 shadow-[1px_0_0_0_var(--border)] text-primary">
              {t("accumulatedBalance")}
            </TableCell>
            {data.accumulatedCells.map((cell, idx) => (
              <TableCell key={idx} className="text-right align-top py-4">
                <div className="flex flex-col items-end">
                  <span className={cn(
                    "font-bold tabular-nums text-lg",
                    cell.amount < 0 ? "text-destructive" : "text-primary",
                    cell.isProjected && "opacity-80"
                  )}>
                    {monetary.formatMonetaryValue(cell.amount)}
                  </span>
                  <span className="text-[9px] uppercase text-muted-foreground">
                    {cell.isProjected ? t("projected") : t("actual")}
                  </span>
                  {renderCellMetrics(cell)}
                </div>
              </TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Table>
    </div>
  )
}
