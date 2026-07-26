// ── Formula Types ──

export type FormulaId =
  | "simple_avg"
  | "moving_avg"
  | "income_pct"
  | "fixed_target"
  | "historical_max"
  | string // allow custom formulas

export interface CustomFormulaDefinition {
  id: string
  name: string
  expression: string // ex.: "([MEDIA] + [DESVIO_P]) * (1 - [CONTENCAO])" — [CONTENCAO]/[MARGEM] já chegam como fração (10% → 0.10)
}

export interface FormulaParams {
  months?: number
  containment?: number
  percentage?: number
  amount?: number
  ceilingAmount?: number
  floorAmount?: number
  margin?: number
  percentile?: number
  reduction?: number
  trimPct?: number
}

export interface FormulaConfig {
  id: FormulaId
  params: FormulaParams
}

export interface BudgetFormulaPreferences {
  global: FormulaConfig
  perCard: Record<string, FormulaConfig>
  customPresets?: CustomFormulaDefinition[]
  customCards?: CustomBudgetCard[]
}

export interface CustomBudgetCard {
  id: string
  name: string
  groupIds: string[]
  categoryIds: string[]
  amount: number
}

export interface HistoryData {
  monthlySpent: number[]
  monthlyIncome: number[]
  monthLabels?: string[] // "YYYY-MM", mesma ordem dos arrays (mais recente primeiro)
  targetMonth?: string   // "YYYY-MM" do mês sendo orçado (início do range)
}

// ── Budget Item Types ──

export interface BudgetItem {
  id: string
  name: string
  originalName: string
  icon: string
  limit: number
  spent: number           // sempre = paidAmount + scheduledAmount
  paidAmount: number      // transações com status "Pago"
  scheduledAmount: number // demais status (Agendado, Pendente, Vencido)
  isGroup: boolean
  parentGroupId?: string
  formulaId?: FormulaId
  hasHistory: boolean
  isCustomFormula?: boolean
  hasFutureProjection?: boolean
  projectedAmount?: number   // projeção de meses futuros do range (NUNCA somada a spent/paidAmount)
  includeInTotals?: boolean  // true apenas para cards nativos de grupo (evita dupla contagem)
  amountSetting?: number
  groupIds?: string[]
  categoryIds?: string[]
  groupId?: string
  categoryId?: string
  limitSource?: "formula" | "fallback" | "none" // formula = calculado; fallback = amount salvo (sem histórico ou fórmula ≤ 0); none = sem limite
  limitBreakdown?: {
    monthlyLimit: number
    monthsInRange: number
    historyUsed: number[] // janela efetivamente usada (mais recente primeiro)
  }
}

export interface GroupWithCategories {
  id: string
  name: string
  code: number
  categories: { id: string; name: string; code: string }[]
}

export interface BudgetPageData {
  items: BudgetItem[]
  totalLimit: number
  totalSpent: number
  totalPaid: number
  totalScheduled: number
  totalProjected: number
  overallPct: number
  formulaConfig: BudgetFormulaPreferences
  groups: GroupWithCategories[]
}

export type ZoneType = "safe" | "warning" | "danger"

export interface ZoneInfo {
  type: ZoneType
  color: string
  label: string
}
