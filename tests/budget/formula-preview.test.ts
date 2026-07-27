import { describe, it, expect } from "vitest"
import { previewCardLimit, previewTotalLimit } from "@/features/budget/lib/formula-preview"
import { calculateFormulaLimit } from "@/features/budget/services/formula-engine"
import type { BudgetFormulaPreferences, BudgetItem } from "@/features/budget/types"

const item = (id: string, historyWindow: number[], includeInTotals = true): BudgetItem =>
  ({
    id,
    name: id,
    originalName: id,
    icon: "",
    limit: 0,
    spent: 0,
    paidAmount: 0,
    scheduledAmount: 0,
    isGroup: true,
    hasHistory: true,
    includeInTotals,
    historyWindow,
  }) as BudgetItem

const config = (over: Partial<BudgetFormulaPreferences> = {}): BudgetFormulaPreferences => ({
  global: { id: "simple_avg", params: { months: 3 } },
  perCard: {},
  customPresets: [],
  customCards: [],
  ...over,
})

describe("previewCardLimit", () => {
  it("devolve o MESMO número do motor usado pelo servidor", () => {
    const history = [1850, 2200, 1640, 1980, 2600, 1750]
    const params = { months: 3, containment: 10 }
    const esperado = calculateFormulaLimit("simple_avg", params, {
      monthlySpent: history,
      monthlyIncome: [],
    })

    const p = previewCardLimit(item("g1", history), { id: "simple_avg", params })
    expect(p.monthlyLimit).toBe(esperado)
    expect(p.monthlyLimit).toBe(1707)
    expect(p.usable).toBe(true)
  })

  it("meta fixa não depende de histórico", () => {
    const p = previewCardLimit(item("g1", []), {
      id: "fixed_target",
      params: { amount: 2000, containment: 5 },
    })
    expect(p.monthlyLimit).toBe(1900)
    expect(p.usable).toBe(true)
  })

  it("sem histórico utilizável, avisa em vez de fingir zero", () => {
    const p = previewCardLimit(item("g1", [0, 0, 0]), { id: "simple_avg", params: { months: 3 } })
    expect(p).toEqual({ monthlyLimit: 0, usable: false, cardsCovered: 1 })
  })

  it("% da receita lê a série de receitas, não a de gastos", () => {
    const p = previewCardLimit(
      item("g1", [0, 0, 0]),
      { id: "income_pct", params: { months: 3, percentage: 30 } },
      [],
      [7000, 7500, 7000]
    )
    expect(p.monthlyLimit).toBe(2150)
    expect(p.usable).toBe(true)
  })
})

describe("previewTotalLimit", () => {
  const items = [
    item("g1", [1000, 1000, 1000]),
    item("g2", [500, 500, 500]),
    item("cat1", [300, 300, 300], false), // categoria: detalhe, não entra no total
  ]

  it("soma só os cartões que entram nos totais da página", () => {
    const p = previewTotalLimit(items, { id: "simple_avg", params: { months: 3 } }, config())
    expect(p.monthlyLimit).toBe(1500)
    expect(p.cardsCovered).toBe(2)
    expect(p.usable).toBe(true)
  })

  it("cartão com fórmula própria mantém a dele — o botão global não o sobrescreve", () => {
    const p = previewTotalLimit(
      items,
      { id: "simple_avg", params: { months: 3 } },
      config({ perCard: { g2: { id: "fixed_target", params: { amount: 2000 } } } })
    )
    expect(p.monthlyLimit).toBe(3000) // 1000 da média de g1 + 2000 fixos de g2
  })

  it("contenção de 10% derruba o total na mesma proporção", () => {
    const p = previewTotalLimit(
      items,
      { id: "simple_avg", params: { months: 3, containment: 10 } },
      config()
    )
    expect(p.monthlyLimit).toBe(1350)
  })

  it("nenhum cartão com histórico → não utilizável", () => {
    const p = previewTotalLimit(
      [item("g1", [0, 0, 0])],
      { id: "simple_avg", params: { months: 3 } },
      config()
    )
    expect(p).toEqual({ monthlyLimit: 0, usable: false, cardsCovered: 1 })
  })
})
