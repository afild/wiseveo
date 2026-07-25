import { describe, it, expect } from "vitest"
import { calculateFormulaLimit } from "@/features/budget/services/formula-engine"
import type { CustomFormulaDefinition, HistoryData } from "@/features/budget/types"

const H: HistoryData = {
  monthlySpent: [1850, 2200, 1640],
  monthlyIncome: [7000, 7500, 7000],
}
const preset = (expression: string): CustomFormulaDefinition[] => [
  { id: "custom_test", name: "Teste", expression },
]

describe("evaluateCustomExpression (via calculateFormulaLimit)", () => {
  it("banda estatística com contenção pré-dividida", () => {
    // MEDIA=1896.67, DESVIO_P=230.99 (populacional), CONTENCAO=0.10
    const r = calculateFormulaLimit(
      "custom_test",
      { months: 3, containment: 10 },
      H,
      preset("([MEDIA] + [DESVIO_P]) * (1 - [CONTENCAO])")
    )
    expect(r).toBe(1914.89)
  })
  it("expressão inválida → 0 (comportamento atual: falha silenciosa)", () => {
    const r = calculateFormulaLimit("custom_test", { months: 3 }, H, preset("[MEDIA] + [TOKEN_ERRADO]"))
    expect(r).toBe(0)
  })
})
