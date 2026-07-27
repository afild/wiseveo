"use client"

import { useTranslations } from "next-intl"
import { Info } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  FORMULA_DESCRIPTION_KEYS,
  FORMULA_EXAMPLE_KEYS,
  FORMULA_NAME_KEYS,
  FORMULA_WHEN_TO_USE_KEYS,
  getFormulaDefinition,
  type BuiltinFormulaId,
} from "../services/formula-engine"

interface FormulaGuidePopoverProps {
  formulaId: BuiltinFormulaId
}

/**
 * Guia da abordagem selecionada: o que ela faz, em que situação é a escolha
 * certa e um caso concreto. Fica onde a decisão acontece (o seletor), não numa
 * ajuda separada — escolher entre 14 mecanismos sem isso é adivinhação.
 *
 * Popover (clique), e não tooltip de hover: são três parágrafos e a página é
 * usada no celular.
 */
export function FormulaGuidePopover({ formulaId }: FormulaGuidePopoverProps) {
  const t = useTranslations("budget.formulaCommon.guide")
  const tFormulas = useTranslations("budget.formulas")

  const definition = getFormulaDefinition(formulaId)
  if (!definition) return null

  const sections = [
    { label: t("howItWorks"), body: tFormulas(FORMULA_DESCRIPTION_KEYS[formulaId]) },
    { label: t("whenToUse"), body: tFormulas(FORMULA_WHEN_TO_USE_KEYS[formulaId]) },
    { label: t("example"), body: tFormulas(FORMULA_EXAMPLE_KEYS[formulaId]) },
  ]

  return (
    <Popover>
      <PopoverTrigger
        aria-label={t("openLabel")}
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 cursor-pointer"
      >
        <Info className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3 p-3" align="start">
        <p className="flex items-center gap-2 text-sm font-medium">
          <span aria-hidden="true">{definition.icon}</span>
          {tFormulas(FORMULA_NAME_KEYS[formulaId])}
        </p>
        {sections.map((section) => (
          <div key={section.label} className="space-y-0.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {section.label}
            </p>
            <p className="text-xs leading-relaxed text-foreground/90">{section.body}</p>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  )
}
