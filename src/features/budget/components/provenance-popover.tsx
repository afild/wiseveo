"use client"

import { useTranslations } from "next-intl"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useMonetaryFormattingSafe } from "@/hooks/use-monetary-formatting"

interface ProvenancePopoverProps {
  formulaName: string
  formulaDesc: string
  /** Janela de histórico efetivamente usada (mais recente primeiro). */
  historyUsed: number[]
  limit: number
}

/**
 * Rodapé de proveniência do limite: sempre visível (nunca hover-only),
 * clique abre a janela de histórico e a aritmética. Mono sinaliza "isto é cálculo".
 */
export function ProvenancePopover({
  formulaName,
  formulaDesc,
  historyUsed,
  limit,
}: ProvenancePopoverProps) {
  const t = useTranslations("budget.itemCard")
  const monetary = useMonetaryFormattingSafe()

  const max = historyUsed.length > 0 ? Math.max(...historyUsed, 1) : 1

  return (
    <Popover>
      <PopoverTrigger
        className="font-mono text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors truncate max-w-[170px] rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        title={formulaDesc}
      >
        {t("viaFormula", { formula: formulaName })}
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 space-y-3" align="start">
        <div className="space-y-1">
          <p className="text-xs font-medium">{t("formulaDetails")}</p>
          <p className="text-xs text-muted-foreground">{formulaDesc}</p>
        </div>

        {historyUsed.length > 0 && (
          <div className="space-y-1.5">
            <p className="font-mono text-xs text-muted-foreground">
              {t("historyWindow", { months: historyUsed.length })}
            </p>
            <div className="flex items-end gap-0.5 h-8">
              {historyUsed.map((v, i) => (
                <div
                  key={i}
                  className="flex-1 bg-primary/60 rounded-t-sm min-h-[2px]"
                  style={{ height: `${(v / max) * 100}%` }}
                  aria-hidden="true"
                />
              ))}
            </div>
            <div className="flex justify-between font-mono text-xs text-muted-foreground">
              <span>{monetary.formatMonetaryValue(historyUsed[historyUsed.length - 1] ?? 0)}</span>
              <span>{monetary.formatMonetaryValue(historyUsed[0] ?? 0)}</span>
            </div>
          </div>
        )}

        <p className="border-t pt-2 font-mono text-xs text-muted-foreground">
          = {monetary.formatMonetaryValue(limit)}
        </p>
      </PopoverContent>
    </Popover>
  )
}
