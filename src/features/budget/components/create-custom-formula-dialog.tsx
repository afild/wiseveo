"use client"

import { useState, useTransition, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Save, Loader2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DetailPanel } from "@/components/detail-panel"
import { saveBudgetFormula } from "../services/save-budget-formula"
import { validateCustomExpression } from "../services/formula-engine"
import type { BudgetFormulaPreferences, CustomFormulaDefinition } from "../types"
import { useRouter } from "next/navigation"

interface CreateCustomFormulaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  formulaConfig: BudgetFormulaPreferences
  editPreset?: CustomFormulaDefinition
}

// Tokens de sintaxe da expressão (dados, não UI); as descrições são traduzidas.
const EXPRESSION_TOKENS = [
  { token: "[MEDIA_ATIVOS]", key: "activeMean" },
  { token: "[MEDIANA]", key: "median" },
  { token: "[P75]", key: "p75" },
  { token: "[P90]", key: "p90" },
  { token: "[MEDIA]", key: "mean" },
  { token: "[MAX]", key: "max" },
  { token: "[MIN]", key: "min" },
  { token: "[DESVIO_P]", key: "stdDev" },
  { token: "[ULTIMO]", key: "lastMonth" },
  { token: "[M_RECEITAS]", key: "incomeAvg" },
  { token: "[U_RECEITA]", key: "lastIncome" },
  { token: "[CONTENCAO]", key: "containment" },
  { token: "[MARGEM]", key: "margin" },
] as const

export function CreateCustomFormulaDialog({
  open,
  onOpenChange,
  formulaConfig,
  editPreset,
}: CreateCustomFormulaDialogProps) {
  const t = useTranslations("budget.customFormulaDialog")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(editPreset?.name || "")
  const [expression, setExpression] = useState(editPreset?.expression || "")
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(editPreset?.name ?? "")
      setExpression(editPreset?.expression ?? "")
      setValidationError(null)
    }
  }, [open, editPreset])

  const handleSave = () => {
    if (!name.trim() || !expression.trim()) return

    const validation = validateCustomExpression(expression.trim())
    if (!validation.ok) {
      setValidationError(validation.errorCode)
      return
    }

    startTransition(async () => {
      const newPreset: CustomFormulaDefinition = {
        id: editPreset ? editPreset.id : "custom_" + Math.random().toString(36).substring(2, 9),
        name: name.trim(),
        expression: expression.trim().toUpperCase(),
      }

      const newConfig: BudgetFormulaPreferences = {
        ...formulaConfig,
        customPresets: editPreset
          ? formulaConfig.customPresets?.map((p) => (p.id === editPreset.id ? newPreset : p))
          : [...(formulaConfig.customPresets || []), newPreset],
        // Criar/editar um mecanismo NÃO altera a fórmula global nem overrides.
      }

      await saveBudgetFormula(newConfig)
      
      setName("")
      setExpression("")
      onOpenChange(false)
      router.refresh()
    })
  }

  const isValid = name.trim().length > 0 && expression.trim().length > 0

  return (
    <DetailPanel
      open={open}
      onOpenChange={onOpenChange}
      title={t("title")}
      description={t("description")}
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {tCommon("cancel")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={isPending || !isValid}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            {t("save")}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">{t("description")}</p>

      <div className="flex flex-col gap-4 py-2">
        {/* Custom name */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {t("nameLabel")} *
          </Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
          />
        </div>

        {/* Expression */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {t("expressionLabel")} *
          </Label>
          <Textarea
            value={expression}
            onChange={(e) => { setExpression(e.target.value); setValidationError(null) }}
            placeholder={t("expressionPlaceholder")}
            className="font-mono"
          />
          {validationError && (
            <p className="text-xs text-destructive">
              {validationError === "non_finite"
                ? t("validation.non_finite")
                : validationError === "unknown_token"
                  ? t("validation.unknown_token")
                  : t("validation.syntax")}
            </p>
          )}
          <div className="mt-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded flex flex-col gap-1 h-32 overflow-y-auto">
            <span className="font-semibold text-foreground mb-1">{t("variables.title")}</span>
            {EXPRESSION_TOKENS.map((v) => (
              <p key={v.key}><code>{v.token}</code>: {t(`variables.${v.key}`)}</p>
            ))}
          </div>
        </div>
      </div>
    </DetailPanel>
  )
}
