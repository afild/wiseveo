import { describe, it, expect } from "vitest"
import { calculateFormulaLimit } from "@/features/budget/services/formula-engine"
import type { HistoryData } from "@/features/budget/types"

// Arrays sempre do mês mais recente para o mais antigo.
const H: HistoryData = {
  monthlySpent: [1850, 2200, 1640, 1980, 2600, 1750],
  monthlyIncome: [7000, 7500, 7000, 7000, 8200, 7000],
}

describe("simple_avg", () => {
  it("média de 3 meses", () => {
    expect(calculateFormulaLimit("simple_avg", { months: 3 }, H)).toBe(1896.67)
  })
  it("com contenção 10%", () => {
    expect(calculateFormulaLimit("simple_avg", { months: 3, containment: 10 }, H)).toBe(1707)
  })
  it("histórico vazio → 0", () => {
    expect(calculateFormulaLimit("simple_avg", { months: 3 }, { monthlySpent: [], monthlyIncome: [] })).toBe(0)
  })
})

describe("moving_avg", () => {
  it("pesos lineares 3-2-1", () => {
    // (1850*3 + 2200*2 + 1640*1) / 6 = 1931.666…
    expect(calculateFormulaLimit("moving_avg", { months: 3 }, H)).toBe(1931.67)
  })
})

describe("income_pct", () => {
  it("30% da média de receitas de 3 meses", () => {
    // média(7000,7500,7000) = 7166.67 → *0.30 = 2150
    expect(calculateFormulaLimit("income_pct", { months: 3, percentage: 30 }, H)).toBe(2150)
  })
})

describe("fixed_target", () => {
  it("valor com contenção 5%", () => {
    expect(
      calculateFormulaLimit("fixed_target", { amount: 2000, containment: 5 }, { monthlySpent: [], monthlyIncome: [] })
    ).toBe(1900)
  })
})

describe("historical_max", () => {
  it("máximo de 6 meses + margem 10%", () => {
    expect(calculateFormulaLimit("historical_max", { months: 6, margin: 10 }, H)).toBe(2860)
  })
})
