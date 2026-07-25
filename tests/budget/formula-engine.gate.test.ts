import { describe, it, expect } from "vitest"
import { hasUsableHistory } from "@/features/budget/services/formula-engine"

describe("hasUsableHistory", () => {
  const income = { monthlySpent: [0, 0, 0, 0, 0, 0], monthlyIncome: [5000, 5000, 5000, 0, 0, 0] }
  it("fixed_target: sempre true", () => {
    expect(hasUsableHistory("fixed_target", {}, { monthlySpent: [], monthlyIncome: [] })).toBe(true)
  })
  it("income_pct: olha a RECEITA, não o gasto", () => {
    expect(hasUsableHistory("income_pct", { months: 3 }, income)).toBe(true)
  })
  it("simple_avg: janela do PRÓPRIO card (não maxMonths)", () => {
    const h = { monthlySpent: [0, 0, 0, 800, 0, 0], monthlyIncome: [] }
    expect(hasUsableHistory("simple_avg", { months: 3 }, h)).toBe(false) // gasto está fora da janela de 3
    expect(hasUsableHistory("simple_avg", { months: 6 }, h)).toBe(true)
  })
  it("custom: gasto OU receita na janela", () => {
    expect(hasUsableHistory("custom_x", { months: 3 }, income)).toBe(true)
  })
})
