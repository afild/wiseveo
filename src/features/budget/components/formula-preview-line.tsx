"use client"

import { useTranslations } from "next-intl"
import { Calculator } from "lucide-react"
import { useMonetaryFormattingSafe } from "@/hooks/use-monetary-formatting"
import type { FormulaPreview } from "../lib/formula-preview"

interface FormulaPreviewLineProps {
  preview: FormulaPreview
  /** "all" = soma dos cartões de grupo (botão global); "card" = um cartão só. */
  scope: "all" | "card"
}

/**
 * O que a abordagem escolhida daria COM OS NÚMEROS DO USUÁRIO, antes de
 * aplicar. Sem isso, escolher fórmula é apostar: o efeito só aparecia depois
 * de salvar. O cálculo é local (a página já traz a janela de histórico), então
 * o valor acompanha cada tecla digitada nos parâmetros.
 */
export function FormulaPreviewLine({ preview, scope }: FormulaPreviewLineProps) {
  const t = useTranslations("budget.formulaCommon.preview")
  const monetary = useMonetaryFormattingSafe()

  return (
    <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Calculator className="size-3" aria-hidden="true" />
        {t("label")}
        <span aria-hidden="true">·</span>
        <span className="normal-case tracking-normal">
          {scope === "all" ? t("allCards", { count: preview.cardsCovered }) : t("thisCard")}
        </span>
      </p>
      {preview.usable ? (
        <p className="font-mono text-sm font-medium tabular-nums">
          {t("perMonth", { value: monetary.formatMonetaryValue(preview.monthlyLimit) })}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{t("noHistory")}</p>
      )}
    </div>
  )
}
