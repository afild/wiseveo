"use client"

import { useTranslations } from "next-intl"
import { AlertTriangle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ZONE_THRESHOLDS, getZoneKey } from "@/features/budget/lib/zones"
import { formatPercentValue } from "@/lib/monetary"
import { useMonetaryFormattingSafe } from "@/hooks/use-monetary-formatting"
import type { BudgetItem } from "../types"

interface BudgetAttentionModuleProps {
  items: BudgetItem[]
}

/** Orçamentos acima do corte de alerta, do pior para o melhor. Some quando não há nenhum. */
export function BudgetAttentionModule({ items }: BudgetAttentionModuleProps) {
  const t = useTranslations("budget")
  const monetary = useMonetaryFormattingSafe()

  const alertItems = items
    .filter((it) => it.limit > 0 && (it.spent / it.limit) * 100 > ZONE_THRESHOLDS.warning)
    .sort((a, b) => b.spent / b.limit - a.spent / a.limit)

  if (alertItems.length === 0) return null

  return (
    <div className="px-4 lg:px-6">
      <div className="space-y-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
          <span className="text-sm font-medium">{t("attention.title")}</span>
          <Badge variant="outline" className="ml-auto border-warning/40 text-xs text-warning">
            {t("attention.subtitle", { count: alertItems.length })}
          </Badge>
        </div>
        <div className="space-y-1">
          {alertItems.map((item) => {
            const pct = (item.spent / item.limit) * 100
            const isOver = item.spent > item.limit
            return (
              <div key={item.id} className="flex items-center gap-2 text-xs">
                <span className="shrink-0">{item.icon}</span>
                <span className="flex-1 truncate text-muted-foreground">{item.name}</span>
                <span
                  className={`shrink-0 font-medium tabular-nums ${
                    getZoneKey(pct) === "danger" ? "text-destructive" : "text-warning"
                  }`}
                >
                  {formatPercentValue(pct, 0)}
                </span>
                {isOver && (
                  <span className="shrink-0 tabular-nums text-destructive">
                    +{monetary.formatMonetaryValue(item.spent - item.limit)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
