"use client"

import { useTranslations } from "next-intl"
import {
  Shield,
  AlertTriangle,
  Flame,
  GripVertical,
  ChevronUp,
  ChevronDown,
  MoreVertical,
  Settings,
  Trash2,
  Edit2,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getZoneKey, type ZoneKey } from "@/features/budget/lib/zones"
import { PeriodBar } from "./period-bar"
import { ProvenancePopover } from "./provenance-popover"
import { getFormulaDescription, getFormulaName } from "../services/formula-engine"
import { deleteBudgetCard } from "../services/save-budget-formula"
import { ConfigCardFormulaDialog } from "./config-card-formula-dialog"
import type { BudgetItem, BudgetFormulaPreferences } from "../types"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { formatPercentValue } from "@/lib/monetary"
import { useMonetaryFormattingSafe } from "@/hooks/use-monetary-formatting"

const ZONE_STYLES: Record<ZoneKey, { text: string; bg: string; border: string }> = {
  safe: { text: "text-positive", bg: "bg-positive/15", border: "border-positive/30" },
  warning: { text: "text-warning", bg: "bg-warning/15", border: "border-warning/30" },
  danger: { text: "text-destructive", bg: "bg-destructive/15", border: "border-destructive/30" },
}

function ZoneIcon({ zone }: { zone: ZoneKey }) {
  if (zone === "safe") return <Shield className="h-3 w-3" />
  if (zone === "warning") return <AlertTriangle className="h-3 w-3" />
  return <Flame className="h-3 w-3" />
}

interface BudgetItemCardProps {
  item: BudgetItem
  index: number
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>
  isDragging?: boolean
  formulaConfig?: BudgetFormulaPreferences
  onEdit?: (item: BudgetItem) => void
  onMoveUp?: () => void
  onMoveDown?: () => void
}

export function BudgetItemCard({
  item,
  dragHandleProps,
  isDragging,
  formulaConfig,
  onEdit,
  onMoveUp,
  onMoveDown,
}: BudgetItemCardProps) {
  const t = useTranslations("budget")
  const tCommon = useTranslations("common")
  const tFormulas = useTranslations("budget.formulas")
  const monetary = useMonetaryFormattingSafe()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isFormulaConfigOpen, setIsFormulaConfigOpen] = useState(false)

  const pct = item.limit > 0 ? (item.spent / item.limit) * 100 : 0
  const zoneKey = getZoneKey(pct)
  const zone = ZONE_STYLES[zoneKey]
  const remaining = item.limit - item.spent
  const isOver = remaining < 0
  const wouldExceed =
    item.paidAmount + item.scheduledAmount > item.limit && item.paidAmount <= item.limit

  const activeFormulaCfg = formulaConfig
    ? formulaConfig.perCard[item.id] ?? formulaConfig.global
    : undefined

  const formulaName = item.formulaId
    ? getFormulaName(tFormulas, item.formulaId, formulaConfig?.customPresets)
    : null
  const formulaDesc = item.formulaId
    ? getFormulaDescription(
        tFormulas,
        item.formulaId,
        activeFormulaCfg?.params ?? {},
        formulaConfig?.customPresets,
      )
    : null

  // Cartões agregados guardam a sentinela "Múltiplos" em originalName; a UI
  // resolve o rótulo traduzido pelo prefixo estável do id.
  const originalLabel = item.id.startsWith("custom_")
    ? t("itemCard.multiple")
    : item.originalName

  const today = new Date()
  const dayOfMonth = today.getDate()
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()

  const handleDelete = () => {
    const isCustom = item.id.startsWith("custom_")
    startTransition(async () => {
      await deleteBudgetCard(item.id, isCustom)
      router.refresh()
    })
  }

  return (
    <Card
      className={`@container/card scroll-mt-20 transition-all duration-200 ${
        isDragging ? "scale-[1.03] z-[100] border-primary shadow-2xl ring-4 ring-primary/10" : ""
      }`}
      style={{
        background:
          "linear-gradient(to top, color-mix(in oklch, var(--primary) 5%, transparent), var(--card))",
      }}
    >
      <CardHeader className="relative pr-24">
        <div className="absolute right-2 top-2 flex items-center flex-row-reverse">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground/30 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">{t("itemCard.editCard")}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(item)}>
                  <Edit2 className="w-4 h-4 mr-2" />
                  {t("itemCard.editCard")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setIsFormulaConfigOpen(true)}>
                <Settings className="w-4 h-4 mr-2" />
                {t("itemCard.configureFormula")}
              </DropdownMenuItem>
              {(onMoveUp || onMoveDown) && <DropdownMenuSeparator />}
              {onMoveUp && (
                <DropdownMenuItem onClick={onMoveUp}>
                  <ChevronUp className="w-4 h-4 mr-2" />
                  {t("itemCard.moveUp")}
                </DropdownMenuItem>
              )}
              {onMoveDown && (
                <DropdownMenuItem onClick={onMoveDown}>
                  <ChevronDown className="w-4 h-4 mr-2" />
                  {t("itemCard.moveDown")}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleDelete}
                className="text-destructive focus:bg-destructive focus:text-destructive-foreground"
                disabled={isPending}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {tCommon("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div
            {...dragHandleProps}
            title={t("itemCard.dragToReorder")}
            className="flex h-11 w-11 cursor-grab items-center justify-center text-muted-foreground/30 transition-colors hover:text-primary active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </div>
        </div>

        <CardDescription className="flex items-center gap-2">
          <span className="text-base">{item.icon}</span>
          {item.isGroup ? t("itemCard.group") : t("itemCard.category")}
          {item.name !== item.originalName && (
            <span className="text-xs opacity-60">({originalLabel})</span>
          )}
        </CardDescription>
        <CardTitle className="text-lg font-semibold @[250px]/card:text-xl">{item.name}</CardTitle>

        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {!item.hasHistory && (
            <Badge variant="outline" className="border-warning/30 bg-warning/10 text-xs text-warning">
              {t("itemCard.noData")}
            </Badge>
          )}
          {item.isCustomFormula && (
            <Badge variant="outline" className="border-info/30 bg-info/10 text-xs text-info">
              {t("itemCard.customBadge")}
            </Badge>
          )}
          {item.limitSource === "fallback" && (
            <Badge variant="outline" className="bg-muted text-xs text-muted-foreground">
              {t("itemCard.manualLimit")}
            </Badge>
          )}
          <Badge variant="outline" className={`text-xs ${zone.bg} ${zone.text} ${zone.border}`}>
            <ZoneIcon zone={zoneKey} />
            <span className="ml-1">{t(`zones.${zoneKey}`)}</span>
            <span className="ml-1.5 tabular-nums">{formatPercentValue(pct, 0)}</span>
          </Badge>
          {wouldExceed && (
            <Badge variant="outline" className="border-warning/30 bg-warning/10 text-xs text-warning">
              <AlertTriangle className="h-2.5 w-2.5" />
              <span className="ml-1">{t("itemCard.mayExceed")}</span>
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline gap-1.5">
            <span className={`text-2xl font-bold tabular-nums ${isOver ? "text-destructive" : ""}`}>
              {monetary.formatMonetaryValue(Math.abs(remaining))}
            </span>
            <span className="text-xs text-muted-foreground">
              {isOver ? t("itemCard.aboveLimit") : t("itemCard.available")}
            </span>
          </div>

          <PeriodBar
            paidAmt={item.paidAmount}
            scheduledAmt={item.scheduledAmount}
            projectedAmt={item.projectedAmount ?? 0}
            limit={item.limit}
            dayOfMonth={dayOfMonth}
            daysInMonth={daysInMonth}
            mini
          />

          <div
            className={`grid gap-1 pt-1 ${
              item.projectedAmount ? "grid-cols-3 @[300px]/card:grid-cols-4" : "grid-cols-3"
            }`}
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">{t("itemCard.budgeted")}</span>
              <span className="text-xs font-medium tabular-nums">
                {monetary.formatMonetaryValue(item.limit)}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">{t("itemCard.paid")}</span>
              <span className="text-xs font-medium tabular-nums">
                {monetary.formatMonetaryValue(item.paidAmount)}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">{t("itemCard.scheduled")}</span>
              <span
                className={`text-xs font-medium tabular-nums ${
                  item.scheduledAmount === 0 ? "text-muted-foreground/40" : ""
                }`}
              >
                {monetary.formatMonetaryValue(item.scheduledAmount)}
              </span>
            </div>
            {item.projectedAmount ? (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">{t("itemCard.projected")}</span>
                <span className="text-xs font-medium tabular-nums text-muted-foreground">
                  {monetary.formatMonetaryValue(item.projectedAmount)}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex items-center justify-between gap-2 border-t pt-3">
        {formulaName && formulaDesc ? (
          <ProvenancePopover
            formulaName={formulaName}
            formulaDesc={formulaDesc}
            historyUsed={item.limitBreakdown?.historyUsed ?? []}
            limit={item.limit}
          />
        ) : (
          <span className="text-xs text-muted-foreground/50">
            {item.limitSource === "none" ? t("itemCard.noLimit") : t("itemCard.manualLimit")}
          </span>
        )}

        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {monetary.formatMonetaryValue(item.limit)}
        </span>
      </CardFooter>

      {formulaConfig && (
        <ConfigCardFormulaDialog
          open={isFormulaConfigOpen}
          onOpenChange={setIsFormulaConfigOpen}
          cardId={item.id}
          cardName={item.name}
          formulaConfig={formulaConfig}
        />
      )}
    </Card>
  )
}
