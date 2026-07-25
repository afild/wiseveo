import type { useTranslations } from "next-intl"

import type { FormulaId, FormulaParams, HistoryData, CustomFormulaDefinition } from "../types"
import { formatMonetaryValue, formatPercentValue } from "@/lib/monetary"

// ── Formula Definitions (metadata for UI) ──
// Display strings live in the "budget.formulas" i18n namespace; this module only
// exposes stable ids/keys that components resolve via useTranslations.

export type BuiltinFormulaId =
  | "simple_avg"
  | "moving_avg"
  | "income_pct"
  | "fixed_target"
  | "historical_max"

export type FormulaVariableLabelKey =
  | "amount"
  | "containment"
  | "margin"
  | "months"
  | "monthsIncome"
  | "percentage"

export interface FormulaVariable {
  key: keyof FormulaParams
  labelKey: FormulaVariableLabelKey
  type: "number" | "percent" | "currency"
  min: number
  max: number
  step: number
  defaultValue: number
}

export interface FormulaDefinition {
  id: BuiltinFormulaId
  icon: string
  variables: FormulaVariable[]
}

// Translator bound to the "budget.formulas" namespace (client or server).
export type FormulasTranslator = ReturnType<typeof useTranslations<"budget.formulas">>

export const FORMULA_NAME_KEYS = {
  fixed_target: "names.fixed_target",
  historical_max: "names.historical_max",
  income_pct: "names.income_pct",
  moving_avg: "names.moving_avg",
  simple_avg: "names.simple_avg",
} as const

export const FORMULA_DESCRIPTION_KEYS = {
  fixed_target: "descriptions.fixed_target",
  historical_max: "descriptions.historical_max",
  income_pct: "descriptions.income_pct",
  moving_avg: "descriptions.moving_avg",
  simple_avg: "descriptions.simple_avg",
} as const

export const FORMULA_DEFINITIONS: FormulaDefinition[] = [
  {
    id: "simple_avg",
    icon: "📊",
    variables: [
      { key: "months", labelKey: "months", type: "number", min: 1, max: 24, step: 1, defaultValue: 3 },
      { key: "containment", labelKey: "containment", type: "percent", min: 0, max: 100, step: 1, defaultValue: 0 },
    ],
  },
  {
    id: "moving_avg",
    icon: "📈",
    variables: [
      { key: "months", labelKey: "months", type: "number", min: 2, max: 24, step: 1, defaultValue: 3 },
      { key: "containment", labelKey: "containment", type: "percent", min: 0, max: 100, step: 1, defaultValue: 0 },
    ],
  },
  {
    id: "income_pct",
    icon: "💰",
    variables: [
      { key: "months", labelKey: "monthsIncome", type: "number", min: 1, max: 12, step: 1, defaultValue: 3 },
      { key: "percentage", labelKey: "percentage", type: "percent", min: 1, max: 100, step: 1, defaultValue: 30 },
      { key: "containment", labelKey: "containment", type: "percent", min: 0, max: 100, step: 1, defaultValue: 0 },
    ],
  },
  {
    id: "fixed_target",
    icon: "🎯",
    variables: [
      { key: "amount", labelKey: "amount", type: "currency", min: 0, max: 999999, step: 50, defaultValue: 0 },
      { key: "containment", labelKey: "containment", type: "percent", min: 0, max: 100, step: 1, defaultValue: 0 },
    ],
  },
  {
    id: "historical_max",
    icon: "🛡️",
    variables: [
      { key: "months", labelKey: "months", type: "number", min: 2, max: 24, step: 1, defaultValue: 6 },
      { key: "margin", labelKey: "margin", type: "percent", min: 0, max: 100, step: 5, defaultValue: 10 },
      { key: "containment", labelKey: "containment", type: "percent", min: 0, max: 100, step: 1, defaultValue: 0 },
    ],
  },
]

export const DEFAULT_FORMULA_CONFIG = {
  id: "simple_avg" as FormulaId,
  params: { months: 3, containment: 0 },
}

// ── Pure Calculation Functions ──

function applyContainment(value: number, containment: number): number {
  const c = Math.min(100, Math.max(0, containment))
  return value * (1 - c / 100)
}

export function clampParamValue(variable: FormulaVariable, raw: number): number {
  if (!Number.isFinite(raw)) return variable.defaultValue
  return Math.min(variable.max, Math.max(variable.min, raw))
}

/**
 * Remove os zeros consecutivos do FIM do array (lado mais antigo — arrays são
 * mais-recente-primeiro). Meses anteriores à primeira atividade registrada não
 * são dado; um zero no meio da janela é gasto real e permanece.
 */
export function trimInactiveTail(values: number[]): number[] {
  let end = values.length
  while (end > 0 && values[end - 1] === 0) end--
  return values.slice(0, end)
}

function calcSimpleAvg(history: HistoryData, params: FormulaParams): number {
  const months = params.months ?? 3
  const spent = trimInactiveTail(history.monthlySpent.slice(0, months))
  if (spent.length === 0) return 0
  const avg = spent.reduce((s, v) => s + v, 0) / spent.length
  return applyContainment(avg, params.containment ?? 0)
}

function calcMovingAvg(history: HistoryData, params: FormulaParams): number {
  const months = params.months ?? 3
  const spent = trimInactiveTail(history.monthlySpent.slice(0, months))
  if (spent.length === 0) return 0

  // Weights: most recent = N, oldest = 1
  let weightedSum = 0
  let totalWeight = 0
  for (let i = 0; i < spent.length; i++) {
    const weight = spent.length - i // Most recent gets highest weight
    weightedSum += spent[i] * weight
    totalWeight += weight
  }

  const avg = totalWeight > 0 ? weightedSum / totalWeight : 0
  return applyContainment(avg, params.containment ?? 0)
}

function calcIncomePct(history: HistoryData, params: FormulaParams): number {
  const months = params.months ?? 3
  const percentage = params.percentage ?? 30
  const income = trimInactiveTail(history.monthlyIncome.slice(0, months))
  if (income.length === 0) return 0
  const avgIncome = income.reduce((s, v) => s + v, 0) / income.length
  const result = avgIncome * (percentage / 100)
  return applyContainment(result, params.containment ?? 0)
}

function calcFixedTarget(_history: HistoryData, params: FormulaParams): number {
  const amount = params.amount ?? 0
  return applyContainment(amount, params.containment ?? 0)
}

function calcHistoricalMax(history: HistoryData, params: FormulaParams): number {
  const months = params.months ?? 6
  const margin = params.margin ?? 10
  const spent = history.monthlySpent.slice(0, months)
  if (spent.length === 0) return 0
  const max = Math.max(...spent)
  const result = max * (1 + margin / 100)
  return applyContainment(result, params.containment ?? 0)
}

const CALCULATORS: Record<FormulaId, (h: HistoryData, p: FormulaParams) => number> = {
  simple_avg: calcSimpleAvg,
  moving_avg: calcMovingAvg,
  income_pct: calcIncomePct,
  fixed_target: calcFixedTarget,
  historical_max: calcHistoricalMax,
}

// ── Math Expression Evaluator ──

function calculateStdDev(values: number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const sqDiffs = values.map((v) => Math.pow(v - mean, 2))
  const variance = sqDiffs.reduce((s, v) => s + v, 0) / values.length
  return Math.sqrt(variance)
}

function evaluateCustomExpression(
  expression: string,
  history: HistoryData,
  params: FormulaParams
): number {
  const months = params.months ?? 3
  const containment = params.containment ?? 0
  const margin = params.margin ?? 0

  const spent = history.monthlySpent.slice(0, months)
  const income = history.monthlyIncome.slice(0, months)
  
  const media = spent.length ? spent.reduce((s, v) => s + v, 0) / spent.length : 0
  const max = spent.length ? Math.max(...spent) : 0
  const min = spent.length ? Math.min(...spent) : 0
  const desvio_p = calculateStdDev(spent)
  const ultimo = history.monthlySpent[0] ?? 0
  
  const m_receitas = income.length ? income.reduce((s, v) => s + v, 0) / income.length : 0
  const u_receita = history.monthlyIncome[0] ?? 0

  let parsedExpr = expression.toUpperCase()

  // Exponenciação passaria no regex de segurança (** são dois '*'), mas
  // produz Infinity trivialmente — bloqueada.
  if (parsedExpr.includes("**")) {
    console.error("Blocked exponent operator in custom formula:", parsedExpr)
    return 0
  }

  parsedExpr = parsedExpr.replace(/\[MEDIA\]/g, media.toFixed(6))
  parsedExpr = parsedExpr.replace(/\[MAX\]/g, max.toFixed(6))
  parsedExpr = parsedExpr.replace(/\[MIN\]/g, min.toFixed(6))
  parsedExpr = parsedExpr.replace(/\[DESVIO_P\]/g, desvio_p.toFixed(6))
  parsedExpr = parsedExpr.replace(/\[ULTIMO\]/g, ultimo.toFixed(6))
  parsedExpr = parsedExpr.replace(/\[M_RECEITAS\]/g, m_receitas.toFixed(6))
  parsedExpr = parsedExpr.replace(/\[U_RECEITA\]/g, u_receita.toFixed(6))
  parsedExpr = parsedExpr.replace(/\[CONTENCAO\]/g, (containment / 100).toFixed(6))
  parsedExpr = parsedExpr.replace(/\[MARGEM\]/g, (margin / 100).toFixed(6))

  // Secure eval: only digits, Math operators, dots, parens, spaces
  const safeRegex = /^[\d.+\-*/\(\)\s]+$/
  if (!safeRegex.test(parsedExpr)) {
    console.error("Invalid Math Expression (blocked by security regex):", parsedExpr)
    return 0
  }

  try {
    // eslint-disable-next-line no-new-func
    const result = new Function(`return ${parsedExpr}`)()
    return Number.isFinite(result) ? Number(result) : 0
  } catch (error) {
    console.error("Failed to evaluate formula:", parsedExpr, error)
    return 0
  }
}

export type CustomExpressionValidation =
  | { ok: true }
  | { ok: false; errorCode: "unknown_token" | "syntax" | "non_finite" }

const KNOWN_TOKENS_RE = /\[(MEDIA|MAX|MIN|DESVIO_P|ULTIMO|M_RECEITAS|U_RECEITA|CONTENCAO|MARGEM)\]/g

/** Valida a expressão contra um histórico sintético não trivial. */
export function validateCustomExpression(expression: string): CustomExpressionValidation {
  const upper = expression.toUpperCase()
  const leftover = upper.replace(KNOWN_TOKENS_RE, "1").match(/\[[A-Z_0-9]*\]?|\]/)
  if (leftover) return { ok: false, errorCode: "unknown_token" }
  const dryHistory: HistoryData = { monthlySpent: [300, 200, 100], monthlyIncome: [1000, 900, 800] }
  const result = evaluateCustomExpression(upper, dryHistory, { months: 3, containment: 10, margin: 10 })
  if (result === 0) {
    // 0 pode ser resultado legítimo OU falha silenciosa; verifica via probe
    const probe = evaluateCustomExpression(
      "1 + 0 * (" + upper + ")",
      dryHistory,
      { months: 3, containment: 10, margin: 10 }
    )
    if (probe !== 1) return { ok: false, errorCode: "syntax" }
  }
  if (!Number.isFinite(result)) return { ok: false, errorCode: "non_finite" }
  return { ok: true }
}

export function calculateFormulaLimit(
  formulaId: FormulaId,
  params: FormulaParams,
  history: HistoryData,
  customDefinitions?: CustomFormulaDefinition[]
): number {
  if (customDefinitions) {
    const customMatch = customDefinitions.find((def) => def.id === formulaId)
    if (customMatch) {
      const result = evaluateCustomExpression(customMatch.expression, history, params)
      return Math.round(result * 100) / 100
    }
  }

  const calc = CALCULATORS[formulaId]
  if (!calc) return 0
  const result = calc(history, params)
  return Math.round(result * 100) / 100 // Round to 2 decimal places
}

/**
 * Um card tem histórico utilizável para a fórmula ativa? Avalia a JANELA do
 * próprio card (params.months) e a série que a fórmula realmente usa:
 * income_pct depende de receita; custom pode usar ambas; fixed_target, nenhuma.
 */
export function hasUsableHistory(
  formulaId: FormulaId,
  params: FormulaParams,
  history: HistoryData
): boolean {
  if (formulaId === "fixed_target") return true
  const months = params.months ?? 3
  const spentActive = history.monthlySpent.slice(0, months).some((v) => v > 0)
  if (formulaId === "income_pct") {
    return history.monthlyIncome.slice(0, months).some((v) => v > 0)
  }
  const isBuiltin = FORMULA_DEFINITIONS.some((f) => f.id === formulaId)
  if (!isBuiltin) {
    // Fórmula custom: tokens podem referenciar gasto ou receita.
    return spentActive || history.monthlyIncome.slice(0, months).some((v) => v > 0)
  }
  return spentActive
}

export function getFormulaDescription(
  t: FormulasTranslator,
  formulaId: FormulaId,
  params: FormulaParams,
  customDefinitions?: CustomFormulaDefinition[]
): string {
  let name = t("names.unknown")

  if (customDefinitions) {
    const customMatch = customDefinitions.find((def) => def.id === formulaId)
    if (customMatch) {
      name = customMatch.name
    }
  }

  if (name === t("names.unknown")) {
    const def = FORMULA_DEFINITIONS.find((f) => f.id === formulaId)
    if (def) {
      name = t(FORMULA_NAME_KEYS[def.id])
    }
  }

  const parts: string[] = [name]

  if (params.months && formulaId !== "fixed_target") {
    parts.push(t("summary.months", { count: params.months }))
  }
  if (params.percentage) {
    parts.push(`${params.percentage}%`)
  }
  if (params.amount && formulaId === "fixed_target") {
    parts.push(formatMonetaryValue(params.amount))
  }
  if (params.margin) {
    parts.push(t("summary.margin", { value: params.margin }))
  }
  if (params.containment && params.containment > 0) {
    parts.push(t("summary.containment", { value: formatPercentValue(-params.containment, 0) }))
  }

  return parts.join(" · ")
}

export function getFormulaDefinition(formulaId: FormulaId): FormulaDefinition | undefined {
  return FORMULA_DEFINITIONS.find((f) => f.id === formulaId)
}
