import { describe, it, expect } from "vitest"
import { calculateFormulaLimit } from "@/features/budget/services/formula-engine"

const h = (spent: number[]) => ({ monthlySpent: spent, monthlyIncome: [] })

describe("median", () => {
  it("N par → média dos dois centrais", () => {
    expect(calculateFormulaLimit("median", { months: 6 }, h([900, 850, 3000, 800, 950, 870]))).toBe(885)
  })
  it("N ímpar", () => {
    expect(calculateFormulaLimit("median", { months: 3 }, h([900, 850, 3000]))).toBe(900)
  })
})

describe("trimmed_mean", () => {
  it("corte 20% em 6 meses remove 1 de cada lado", () => {
    expect(
      calculateFormulaLimit("trimmed_mean", { months: 6, trimPct: 20 }, h([700, 800, 850, 900, 950, 3000]))
    ).toBe(875)
  })
})

describe("percentile_n", () => {
  it("P75 com interpolação linear", () => {
    const spent = [600, 700, 750, 800, 850, 900, 950, 1000, 1100, 1200, 1350, 1500]
    // idx = 11*0.75 = 8.25 → 1100 + 0.25*(1200-1100) = 1125
    expect(calculateFormulaLimit("percentile_n", { months: 12, percentile: 75 }, h(spent))).toBe(1125)
  })
})

describe("active_avg", () => {
  it("média só dos meses com gasto", () => {
    expect(calculateFormulaLimit("active_avg", { months: 6 }, h([0, 400, 0, 380, 0, 420]))).toBe(400)
  })
})

describe("banded_avg", () => {
  it("teto força contenção", () => {
    expect(
      calculateFormulaLimit("banded_avg", { months: 3, ceilingAmount: 1200 }, h([1450, 1450, 1450]))
    ).toBe(1200)
  })
  it("piso segura mês atípico", () => {
    expect(
      calculateFormulaLimit("banded_avg", { months: 3, floorAmount: 400 }, h([350, 350, 350]))
    ).toBe(400)
  })
})

describe("declining_target", () => {
  it("catraca: base = min(último, média), corte 5%", () => {
    // média(950,1000,1050)=1000; min(950,1000)=950; *0.95 = 902.5
    expect(
      calculateFormulaLimit("declining_target", { months: 3, reduction: 5 }, h([950, 1000, 1050]))
    ).toBe(902.5)
  })
  it("piso limita a descida", () => {
    expect(
      calculateFormulaLimit("declining_target", { months: 3, reduction: 50, floorAmount: 600 }, h([950, 1000, 1050]))
    ).toBe(600)
  })
})
