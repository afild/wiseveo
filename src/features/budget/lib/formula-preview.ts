import { calculateFormulaLimit, hasUsableHistory } from "../services/formula-engine"
import type {
  BudgetFormulaPreferences,
  BudgetItem,
  CustomFormulaDefinition,
  FormulaConfig,
  HistoryData,
} from "../types"

/**
 * Tamanho da janela de histórico que a página carrega por cartão. É o teto do
 * seletor de meses (`MAX_HISTORY_MONTHS`), para que trocar de abordagem na
 * prévia nunca peça um mês que o cliente não tem.
 */
export const PREVIEW_MONTHS = 24

/** Abordagens que ignoram o histórico — o valor sai só dos parâmetros. */
const HISTORY_FREE_FORMULAS = ["fixed_target", "sinking_fund"]

export interface FormulaPreview {
  /** Limite MENSAL que a abordagem produziria (0 quando não dá para calcular). */
  monthlyLimit: number
  /** Falso quando falta histórico utilizável — a UI explica em vez de mostrar 0. */
  usable: boolean
  /** Quantos cartões entraram na conta (1 no modo cartão). */
  cardsCovered: number
}

const EMPTY_HISTORY: HistoryData = { monthlySpent: [], monthlyIncome: [] }

/**
 * Limite mensal que `formula` daria para `item`, calculado no cliente com a
 * janela que veio no payload da página. Usa exatamente o mesmo motor do
 * servidor — a prévia e o cartão salvo não podem divergir.
 */
export function previewCardLimit(
  item: Pick<BudgetItem, "historyWindow">,
  formula: FormulaConfig,
  presets?: CustomFormulaDefinition[],
  incomeWindow: number[] = []
): FormulaPreview {
  if (HISTORY_FREE_FORMULAS.includes(formula.id)) {
    const limit = calculateFormulaLimit(formula.id, formula.params, EMPTY_HISTORY, presets)
    return { monthlyLimit: limit, usable: limit > 0, cardsCovered: 1 }
  }

  const history: HistoryData = {
    monthlySpent: item.historyWindow ?? [],
    monthlyIncome: incomeWindow,
  }

  if (!hasUsableHistory(formula.id, formula.params, history)) {
    return { monthlyLimit: 0, usable: false, cardsCovered: 1 }
  }

  const limit = calculateFormulaLimit(formula.id, formula.params, history, presets)
  return { monthlyLimit: limit, usable: limit > 0, cardsCovered: 1 }
}

/**
 * Soma dos limites mensais que "Aplicar a todos" produziria — ou seja, o
 * "Orçado Total" de um mês depois de aplicar. Respeita os cartões com fórmula
 * própria (o botão global não os sobrescreve) e conta só os cartões que entram
 * nos totais da página, para não somar o mesmo gasto duas vezes.
 */
export function previewTotalLimit(
  items: BudgetItem[],
  candidate: FormulaConfig,
  config: BudgetFormulaPreferences,
  incomeWindow: number[] = []
): FormulaPreview {
  const counted = items.filter((item) => item.includeInTotals)

  let monthlyLimit = 0
  let usableCards = 0

  for (const item of counted) {
    const formula = config.perCard[item.id] ?? candidate
    const preview = previewCardLimit(item, formula, config.customPresets, incomeWindow)
    if (preview.usable) usableCards++
    monthlyLimit += preview.monthlyLimit
  }

  return {
    monthlyLimit,
    usable: usableCards > 0,
    cardsCovered: counted.length,
  }
}
