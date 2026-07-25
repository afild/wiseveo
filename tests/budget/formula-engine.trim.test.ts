import { describe, it, expect } from "vitest"
import { calculateFormulaLimit, trimInactiveTail } from "@/features/budget/services/formula-engine"

describe("trimInactiveTail", () => {
  it("remove zeros consecutivos só do fim (lado antigo)", () => {
    expect(trimInactiveTail([900, 0, 0])).toEqual([900])
    expect(trimInactiveTail([1850, 0, 1640])).toEqual([1850, 0, 1640])
    expect(trimInactiveTail([0, 0, 0])).toEqual([])
    expect(trimInactiveTail([])).toEqual([])
  })
})

describe("médias ignoram meses de inatividade no fim da janela", () => {
  it("simple_avg: categoria nova com 1 mês de dado", () => {
    const h = { monthlySpent: [900, 0, 0], monthlyIncome: [] }
    expect(calculateFormulaLimit("simple_avg", { months: 3 }, h)).toBe(900) // antes: 300
  })
  it("simple_avg: zero no MEIO é dado legítimo", () => {
    const h = { monthlySpent: [1850, 0, 1640], monthlyIncome: [] }
    expect(calculateFormulaLimit("simple_avg", { months: 3 }, h)).toBe(1163.33)
  })
  it("moving_avg: pesos recalculados sobre a janela ativa", () => {
    const h = { monthlySpent: [900, 0, 0], monthlyIncome: [] }
    expect(calculateFormulaLimit("moving_avg", { months: 3 }, h)).toBe(900) // antes: 450
  })
  it("income_pct: receita nova não é diluída", () => {
    const h = { monthlySpent: [100, 100, 100], monthlyIncome: [5000, 0, 0] }
    expect(calculateFormulaLimit("income_pct", { months: 3, percentage: 30 }, h)).toBe(1500) // antes: 500
  })
})
