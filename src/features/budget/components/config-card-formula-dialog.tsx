"use client"

import { useState, useTransition, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Check, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DetailPanel } from "@/components/detail-panel"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  FORMULA_DEFINITIONS,
  FORMULA_DESCRIPTION_KEYS,
  FORMULA_NAME_KEYS,
  clampParamValue,
  getFormulaDefinition,
  type FormulaVariable,
} from "../services/formula-engine"
import { saveCardFormula } from "../services/save-budget-formula"
import type { BudgetFormulaPreferences, FormulaId, FormulaParams } from "../types"
import { useRouter } from "next/navigation"

interface ConfigCardFormulaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cardId: string
  cardName: string
  formulaConfig: BudgetFormulaPreferences
}

export function ConfigCardFormulaDialog({
  open,
  onOpenChange,
  cardId,
  cardName,
  formulaConfig,
}: ConfigCardFormulaDialogProps) {
  const t = useTranslations("budget")
  const tCommon = useTranslations("common")
  const tFormulas = useTranslations("budget.formulas")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  
  const existingOverride = formulaConfig.perCard[cardId]
  
  const [selectedId, setSelectedId] = useState<FormulaId>(
    existingOverride?.id || formulaConfig.global.id
  )
  const [params, setParams] = useState<FormulaParams>(
    existingOverride?.params || formulaConfig.global.params
  )

  useEffect(() => {
    if (open) {
      const override = formulaConfig.perCard[cardId]
      if (override) {
        setSelectedId(override.id)
        setParams(override.params || {})
      } else {
        setSelectedId(formulaConfig.global.id)
        setParams(formulaConfig.global.params || {})
      }
    }
  }, [open, cardId, formulaConfig])

  const definition = getFormulaDefinition(selectedId)
  const isCustomDef = formulaConfig.customPresets?.find((p) => p.id === selectedId)

  const handleFormulaChange = (id: string) => {
    const newId = id as FormulaId
    setSelectedId(newId)

    const def = getFormulaDefinition(newId)
    if (def) {
      const defaults: FormulaParams = {}
      for (const v of def.variables) {
        ;(defaults as any)[v.key] = v.defaultValue
      }
      setParams(defaults)
    } else if (formulaConfig.customPresets?.some(p => p.id === newId)) {
      setParams({ months: 3, containment: 0, margin: 0 })
    }
  }

  const handleParamChange = (key: keyof FormulaParams, value: number) => {
    setParams((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = () => {
    startTransition(async () => {
      await saveCardFormula(cardId, { id: selectedId, params })
      onOpenChange(false)
      router.refresh()
    })
  }

  const handleRestoreGlobal = () => {
    startTransition(async () => {
      await saveCardFormula(cardId, null)
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <DetailPanel
      open={open}
      onOpenChange={onOpenChange}
      title={t("configFormulaDialog.title")}
      description={t.markup("configFormulaDialog.description", {
        name: cardName,
        strong: (chunks) => chunks,
      })}
      className="flex flex-col gap-4"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          {existingOverride ? (
             <Button
               variant="outline"
               onClick={handleRestoreGlobal}
               disabled={isPending}
               className="text-muted-foreground"
             >
               {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
               {t("configFormulaDialog.restoreGlobal")}
             </Button>
          ) : <div />}
          <Button
            onClick={handleSave}
            disabled={isPending || (selectedId === "fixed_target" && (params.amount ?? 0) <= 0)}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Check className="h-4 w-4 mr-1" />
            )}
            {tCommon("confirm")}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-muted-foreground">
        {t.rich("configFormulaDialog.description", {
          name: cardName,
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </p>

      {/* Formula Selector */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("formulaCommon.approach")}</Label>
        <div className="flex gap-2 w-full">
          <Select value={selectedId} onValueChange={handleFormulaChange}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORMULA_DEFINITIONS.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  <span className="flex items-center gap-2">
                    <span>{f.icon}</span>
                    <span>{tFormulas(FORMULA_NAME_KEYS[f.id])}</span>
                  </span>
                </SelectItem>
              ))}
              {formulaConfig.customPresets && formulaConfig.customPresets.length > 0 && (
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase">
                  {t("formulaCommon.customMechanisms")}
                </div>
              )}
              {formulaConfig.customPresets?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="flex items-center gap-2">
                    <span>⚡</span>
                    <span>{p.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {definition && (
          <p className="text-xs text-muted-foreground">
            {tFormulas(FORMULA_DESCRIPTION_KEYS[definition.id])}
          </p>
        )}
      </div>

      {/* Dynamic Variables */}
      {definition && (
        <div className="grid grid-cols-2 gap-3">
          {definition.variables.map((v: FormulaVariable) => (
            <div key={v.key} className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {tFormulas(`variables.${v.labelKey}`)}
                {v.type === "percent" && " (%)"}
              </Label>
              <Input
                type="number"
                min={v.min}
                max={v.max}
                step={v.step}
                value={(params as any)[v.key] ?? v.defaultValue}
                onChange={(e) =>
                  handleParamChange(
                    v.key,
                    clampParamValue(v, parseFloat(e.target.value.replace(",", ".")))
                  )
                }
                className="tabular-nums font-mono text-sm h-9"
              />
            </div>
          ))}
        </div>
      )}

      {isCustomDef && (
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("formulaCommon.customParams.months")}</Label>
            <Input type="number" min={1} max={24} value={params.months ?? 3} onChange={(e) => handleParamChange("months", Math.min(24, Math.max(1, parseFloat(e.target.value.replace(",", ".")) || 3)))} className="tabular-nums font-mono text-sm h-9" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("formulaCommon.customParams.containment")}</Label>
            <Input type="number" min={0} max={100} value={params.containment ?? 0} onChange={(e) => handleParamChange("containment", Math.min(100, Math.max(0, parseFloat(e.target.value.replace(",", ".")) || 0)))} className="tabular-nums font-mono text-sm h-9" />
          </div>
          <div className="flex flex-col gap-1.5 col-span-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("formulaCommon.customParams.margin")}</Label>
            <Input type="number" min={0} max={100} value={params.margin ?? 0} onChange={(e) => handleParamChange("margin", Math.min(100, Math.max(0, parseFloat(e.target.value.replace(",", ".")) || 0)))} className="tabular-nums font-mono text-sm h-9" />
          </div>
        </div>
      )}
    </DetailPanel>
  )
}
