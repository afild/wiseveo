import { describe, it, expect } from "vitest"
import { calculateFormulaLimit } from "@/features/budget/services/formula-engine"

describe("seasonal_yoy", () => {
  const labels = [
    "2026-11", "2026-10", "2026-09", "2026-08", "2026-07", "2026-06",
    "2026-05", "2026-04", "2026-03", "2026-02", "2026-01", "2025-12",
  ]
  const h = {
    monthlySpent: [1500, 1450, 1550, 1500, 1400, 1500, 1450, 1500, 1400, 1550, 1500, 2400],
    monthlyIncome: [],
    monthLabels: labels,
    targetMonth: "2026-12",
  }
  it("blend do mesmo mês do ano anterior com a média recente", () => {
    // yoy(2025-12)=2400; média recente 3m = (1500+1450+1550)/3 = 1500
    // 0.6*2400*1.10 + 0.4*1500 = 1584 + 600 = 2184
    expect(calculateFormulaLimit("seasonal_yoy", { seasonalWeight: 60, margin: 10 }, h)).toBe(2184)
  })
  it("sem dado YoY → degrada para a média recente", () => {
    const h2 = { ...h, monthlySpent: [...h.monthlySpent.slice(0, 11), 0], targetMonth: "2026-12" }
    expect(calculateFormulaLimit("seasonal_yoy", { seasonalWeight: 60, margin: 10 }, h2)).toBe(1500)
  })
})
