"use client"

import { useTranslations } from "next-intl"
import { Shield, AlertTriangle, Flame, GripVertical, FlaskConical, Clock } from "lucide-react"
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoreVertical, Settings, Trash2, Edit2 } from "lucide-react"
import { SplitProgressBar } from "./split-progress-bar"
import { getFormulaDescription } from "../services/formula-engine"
import { deleteBudgetCard } from "../services/save-budget-formula"
import { ConfigCardFormulaDialog } from "./config-card-formula-dialog"
import type { BudgetItem, BudgetFormulaPreferences } from "../types"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { formatPercentValue } from "@/lib/monetary"
import { useMonetaryFormattingSafe } from "@/hooks/use-monetary-formatting"

function getZoneInfo(pct: number) {
  if (pct <= 50)
    return {
      color: "text-positive",
      bgColor: "bg-positive/15",
      borderColor: "border-positive/30",
      icon: <Shield className="h-3 w-3" />,
      labelKey: "safe" as const,
    }
  if (pct <= 80)
    return {
      color: "text-warning",
      bgColor: "bg-warning/15",
      borderColor: "border-warning/30",
      icon: <AlertTriangle className="h-3 w-3" />,
      labelKey: "warning" as const,
    }
  return {
    color: "text-destructive",
    bgColor: "bg-destructive/15",
    borderColor: "border-destructive/30",
    icon: <Flame className="h-3 w-3" />,
    labelKey: "danger" as const,
  }
}

interface BudgetItemCardProps {
  item: BudgetItem
  index: number
  dragHandleProps?: any
  isDragging?: boolean
  formulaConfig?: BudgetFormulaPreferences
  onEdit?: (item: BudgetItem) => void
}

export function BudgetItemCard({ 
  item, 
  index, 
  dragHandleProps,
  isDragging,
  formulaConfig,
  onEdit
}: BudgetItemCardProps) {
  const t = useTranslations("budget")
  const tCommon = useTranslations("common")
  const tFormulas = useTranslations("budget.formulas")
  const monetary = useMonetaryFormattingSafe()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isFormulaConfigOpen, setIsFormulaConfigOpen] = useState(false)

  const pct = item.limit > 0 ? (item.spent / item.limit) * 100 : 0
  const paidPct = item.limit > 0 ? (item.paidAmount / item.limit) * 100 : 0
  const zone = getZoneInfo(pct)
  const remaining = item.limit - item.spent
  const wouldExceed =
    item.paidAmount + item.scheduledAmount > item.limit && item.paidAmount <= item.limit

  const formulaDesc = item.formulaId
    ? getFormulaDescription(tFormulas, item.formulaId, {})
    : undefined

  // Cartões agregados guardam a sentinela "Múltiplos" em originalName; a UI
  // resolve o rótulo traduzido pelo prefixo estável do id.
  const originalLabel = item.id.startsWith("custom_")
    ? t("itemCard.multiple")
    : item.originalName

  const handleDelete = () => {
    // Determine if custom card by ID prefix.
    const isCustom = item.id.startsWith("custom_")
    startTransition(async () => {
      await deleteBudgetCard(item.id, isCustom)
      router.refresh()
    })
  }

  return (
    <Card className={`@container/card transition-all duration-200 ${isDragging ? "scale-[1.03] z-[100] border-primary shadow-2xl ring-4 ring-primary/10" : ""}`} style={{ background: "linear-gradient(to top, color-mix(in oklch, var(--primary) 5%, transparent), var(--card))" }}>
      <CardHeader className="relative pr-10">
        <div className="absolute right-4 top-4 flex w-fit items-center flex-row-reverse gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger className="p-1 text-muted-foreground/30 hover:text-primary transition-colors focus:outline-none">
              <MoreVertical className="h-4 w-4" />
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
            className="p-1 text-muted-foreground/30 hover:text-primary transition-colors cursor-grab active:cursor-grabbing"
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
          {/* Formula indicator */}
          {item.formulaId && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={`inline-flex items-center ${item.isCustomFormula ? "text-info" : "text-muted-foreground/50"}`}>
                    <FlaskConical className="h-3 w-3" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">
                    {formulaDesc}
                    {item.isCustomFormula && ` ${t("itemCard.customSuffix")}`}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </CardDescription>
        <CardTitle className="text-lg font-semibold @[250px]/card:text-xl">
          {item.name}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          {!item.hasHistory && (
            <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 text-[10px]">
              {t("itemCard.noData")}
            </Badge>
          )}
          {item.isCustomFormula && (
            <Badge variant="outline" className="bg-info/10 text-info border-info/30 text-[10px]">
              {t("itemCard.customBadge")}
            </Badge>
          )}
          <Badge
            variant="outline"
            className={`${zone.bgColor} ${zone.color} ${zone.borderColor}`}
          >
            {zone.icon}
            <span className="ml-1">{t(`zones.${zone.labelKey}`)}</span>
          </Badge>
          {wouldExceed && (
            <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 text-[10px]">
              <AlertTriangle className="h-2.5 w-2.5" />
              <span className="ml-1">{t("itemCard.mayExceed")}</span>
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          {/* Percentage + Progress */}
          <div className="flex items-baseline gap-1.5">
            <span className={`text-2xl font-bold tabular-nums ${zone.color}`}>
              {formatPercentValue(pct, 0)}
            </span>
            <span className="text-xs text-muted-foreground">{t("itemCard.used")}</span>
          </div>
          <SplitProgressBar paidPct={paidPct} totalPct={pct} delay={index * 60} />

          {/* Values — 3 colunas (+ 4ª condicional Projetado): Orçado | Pago | Agendado | Projetado? */}
          <div className={`grid gap-1 pt-1 ${item.projectedAmount ? "@[300px]/card:grid-cols-4 grid-cols-3" : "grid-cols-3"}`}>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-muted-foreground">{t("itemCard.budgeted")}</span>
              <span className="text-xs font-medium tabular-nums">
                {monetary.formatMonetaryValue(item.limit)}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-muted-foreground">{t("itemCard.paid")}</span>
              <span className="text-xs font-medium tabular-nums">
                {monetary.formatMonetaryValue(item.paidAmount)}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" />
                {t("itemCard.scheduled")}
              </span>
              <span className={`text-xs font-medium tabular-nums ${item.scheduledAmount === 0 ? "text-muted-foreground/40" : ""}`}>
                {monetary.formatMonetaryValue(item.scheduledAmount)}
              </span>
            </div>
            {item.projectedAmount ? (
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground">{t("itemCard.projected")}</span>
                <span className="text-xs font-medium tabular-nums text-muted-foreground">
                  {monetary.formatMonetaryValue(item.projectedAmount)}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex items-center justify-between border-t pt-3">
        <span className="text-xs text-muted-foreground">
          {remaining >= 0 ? t("status.remaining") : t("status.exceeded")}
        </span>
        <span className={`text-sm font-semibold tabular-nums ${zone.color}`}>
          {monetary.formatMonetaryValue(remaining)}
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
