import { describe, it, expect } from "vitest"
import { calculateFormulaLimit } from "@/features/budget/services/formula-engine"
import type { CustomFormulaDefinition } from "@/features/budget/types"

const preset = (e: string): CustomFormulaDefinition[] => [{ id: "custom_t", name: "T", expression: e }]

describe("tokens novos", () => {
  const h = { monthlySpent: [900, 850, 3000, 800, 950, 870], monthlyIncome: [] }
  it("[MEDIANA]", () => {
    expect(calculateFormulaLimit("custom_t", { months: 6 }, h, preset("[MEDIANA]"))).toBe(885)
  })
  it("[P75]", () => {
    // sorted: 800,850,870,900,950,3000 → idx 5*0.75=3.75 → 900+0.75*50 = 937.5
    expect(calculateFormulaLimit("custom_t", { months: 6 }, h, preset("[P75]"))).toBe(937.5)
  })
  it("[MEDIA_ATIVOS]", () => {
    const h2 = { monthlySpent: [0, 400, 0, 380, 0, 420], monthlyIncome: [] }
    expect(calculateFormulaLimit("custom_t", { months: 6 }, h2, preset("[MEDIA_ATIVOS]"))).toBe(400)
  })
})
