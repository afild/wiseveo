"use client"

import { useMemo, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { FlaskConical, Check, Edit2, Trash2 } from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { CreateCustomFormulaDialog } from "./create-custom-formula-dialog"
import { FormulaGuidePopover } from "./formula-guide-popover"
import { FormulaPreviewLine } from "./formula-preview-line"
import { previewTotalLimit } from "../lib/formula-preview"
import { saveBudgetFormula } from "../services/save-budget-formula"
import type {
  BudgetFormulaPreferences,
  BudgetItem,
  FormulaId,
  FormulaParams,
} from "../types"
import { useRouter } from "next/navigation"

interface FormulaManagerCardProps {
  formulaConfig: BudgetFormulaPreferences
  hasAnyHistory: boolean
  items: BudgetItem[]
  incomeWindow: number[]
}

export function FormulaManagerCard({
  formulaConfig,
  hasAnyHistory,
  items,
  incomeWindow,
}: FormulaManagerCardProps) {
  const t = useTranslations("budget")
  const tFormulas = useTranslations("budget.formulas")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedId, setSelectedId] = useState<FormulaId>(
    formulaConfig.global.id
  )
  const [params, setParams] = useState<FormulaParams>(
    formulaConfig.global.params
  )
  const [saved, setSaved] = useState(false)
  const [isCreatorOpen, setIsCreatorOpen] = useState(false)

  const definition = getFormulaDefinition(selectedId)
  const isCustomDef = formulaConfig.customPresets?.find((p) => p.id === selectedId)

  // O que "Aplicar a todos" produziria no Orçado Total deste mês.
  const preview = useMemo(
    () => previewTotalLimit(items, { id: selectedId, params }, formulaConfig, incomeWindow),
    [items, selectedId, params, formulaConfig, incomeWindow]
  )

  const [editPreset, setEditPreset] = useState<any>(null)

  const openCreator = (preset?: any) => {
    setEditPreset(preset || null)
    setIsCreatorOpen(true)
  }

  const handleDeleteCustomPreset = () => {
    if (!isCustomDef) return
    if (!window.confirm(t("formulaManager.confirmDelete", { name: isCustomDef.name }))) return
    startTransition(async () => {
      const cleanedPerCard = Object.fromEntries(
        Object.entries(formulaConfig.perCard).filter(([, cfg]) => cfg.id !== selectedId)
      )
      const newConfig: BudgetFormulaPreferences = {
        ...formulaConfig,
        customPresets: formulaConfig.customPresets?.filter((p) => p.id !== selectedId),
        perCard: cleanedPerCard,
      }
      if (newConfig.global.id === selectedId) {
        newConfig.global = { id: "simple_avg", params: { months: 3, containment: 0 } }
      }
      await saveBudgetFormula(newConfig)
      setSelectedId(newConfig.global.id)
      setParams(newConfig.global.params)
      router.refresh()
    })
  }

  const handleFormulaChange = (id: string) => {
    const newId = id as FormulaId
    setSelectedId(newId)
    setSaved(false)

    // Reset params to defaults for the new formula
    const def = getFormulaDefinition(newId)
    if (def) {
      const defaults: FormulaParams = {}
      for (const v of def.variables) {
        ;(defaults as any)[v.key] = v.defaultValue
      }
      setParams(defaults)
    } else if (formulaConfig.customPresets?.some(p => p.id === newId)) {
      // It's a custom one, add base generic variables
      setParams({ months: 3, containment: 0, margin: 0 })
    }
  }

  const handleParamChange = (key: keyof FormulaParams, value: number) => {
    setParams((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  const handleApply = () => {
    startTransition(async () => {
      const newConfig: BudgetFormulaPreferences = {
        ...formulaConfig,
        global: { id: selectedId, params },
      }
      await saveBudgetFormula(newConfig)
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <Card className="@container/card h-full">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4" />
          {t("formulaManager.globalConfig")}
        </CardDescription>
        <CardTitle className="text-lg font-semibold @[250px]/card:text-xl">
          {t("formulaManager.title")}
        </CardTitle>
        <CardAction>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
              {isCustomDef
                ? "⚡ " + isCustomDef.name
                : definition
                  ? definition.icon + " " + tFormulas(FORMULA_NAME_KEYS[definition.id])
                  : ""}
            </Badge>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          {/* Formula Selector */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">{t("formulaCommon.approach")}</Label>
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
              <div className="flex gap-1">
                {isCustomDef && (
                  <>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => openCreator(isCustomDef)}
                      title={t("formulaManager.editMechanism")}
                      disabled={isPending}
                    >
                      <Edit2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleDeleteCustomPreset}
                      title={t("formulaManager.deleteMechanism")}
                      disabled={isPending}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </>
                )}
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => openCreator()}
                  title={t("formulaManager.newMechanism")}
                >
                  <span className="text-xl leading-none -mt-1">+</span>
                </Button>
              </div>
            </div>
            {definition && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <FormulaGuidePopover formulaId={definition.id} />
                <span>{tFormulas(FORMULA_DESCRIPTION_KEYS[definition.id])}</span>
              </p>
            )}
            {isCustomDef && (
              <p className="text-xs text-muted-foreground font-mono bg-muted/50 p-1 rounded">
                {t("formulaManager.expression")} {isCustomDef.expression}
              </p>
            )}
          </div>

          {/* Dynamic Variables */}
          {definition && (
            <div className="grid grid-cols-2 gap-3">
              {definition.variables.map((v: FormulaVariable) => (
                <div key={v.key} className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">
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
                <Label className="text-xs text-muted-foreground">{t("formulaCommon.customParams.months")}</Label>
                <Input type="number" min={1} max={24} value={params.months ?? 3} onChange={(e) => handleParamChange("months", Math.min(24, Math.max(1, parseFloat(e.target.value.replace(",", ".")) || 3)))} className="tabular-nums font-mono text-sm h-9" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">{t("formulaCommon.customParams.containment")}</Label>
                <Input type="number" min={0} max={100} value={params.containment ?? 0} onChange={(e) => handleParamChange("containment", Math.min(100, Math.max(0, parseFloat(e.target.value.replace(",", ".")) || 0)))} className="tabular-nums font-mono text-sm h-9" />
              </div>
              <div className="flex flex-col gap-1.5 col-span-2">
                <Label className="text-xs text-muted-foreground">{t("formulaCommon.customParams.margin")}</Label>
                <Input type="number" min={0} max={100} value={params.margin ?? 0} onChange={(e) => handleParamChange("margin", Math.min(100, Math.max(0, parseFloat(e.target.value.replace(",", ".")) || 0)))} className="tabular-nums font-mono text-sm h-9" />
              </div>
            </div>
          )}

          {/* Prévia: o que este mecanismo daria antes de aplicar */}
          {hasAnyHistory && <FormulaPreviewLine preview={preview} scope="all" />}

          {/* No history warning */}
          {!hasAnyHistory && (
            <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2">
              <p className="text-xs text-warning">
                {t("formulaManager.noHistory")}
              </p>
            </div>
          )}

          {/* Apply Button */}
          <Button
            onClick={handleApply}
            disabled={isPending || saved || (selectedId === "fixed_target" && (params.amount ?? 0) <= 0)}
            className="w-full"
            size="sm"
          >
            {isPending ? (
              <span className="animate-pulse">{t("formulaManager.applying")}</span>
            ) : saved ? (
              <>
                <Check className="h-4 w-4 mr-1" />
                {t("formulaManager.applied")}
              </>
            ) : (
              t("formulaManager.applyAll")
            )}
          </Button>
        </div>
      </CardContent>
      <CreateCustomFormulaDialog 
        open={isCreatorOpen} 
        onOpenChange={setIsCreatorOpen} 
        formulaConfig={formulaConfig} 
        editPreset={editPreset}
      />
    </Card>
  )
}
