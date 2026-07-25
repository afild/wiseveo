import { describe, it, expect } from "vitest"
import { calculateFormulaLimit } from "@/features/budget/services/formula-engine"
import type { CustomFormulaDefinition } from "@/features/budget/types"

const preset = (expression: string): CustomFormulaDefinition[] => [{ id: "custom_t", name: "T", expression }]

describe("robustez do eval custom", () => {
  it("divisão por zero → 0 (não Infinity)", () => {
    const h = { monthlySpent: [900, 0, 900], monthlyIncome: [] } // MIN = 0
    expect(calculateFormulaLimit("custom_t", { months: 3 }, h, preset("[MEDIA] / [MIN]"))).toBe(0)
  })
  it("exponenciação ** é bloqueada → 0", () => {
    const h = { monthlySpent: [100, 100, 100], monthlyIncome: [] }
    expect(calculateFormulaLimit("custom_t", { months: 3 }, h, preset("9 ** 9 ** 9"))).toBe(0)
  })
  it("valores minúsculos não viram notação científica", () => {
    // DESVIO_P de série constante = 0 exato com toFixed(6); expressão continua válida
    const h = { monthlySpent: [0.1, 0.1, 0.1], monthlyIncome: [] }
    expect(calculateFormulaLimit("custom_t", { months: 3 }, h, preset("[MEDIA] + [DESVIO_P]"))).toBe(0.1)
  })
})
