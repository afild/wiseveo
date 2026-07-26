import { describe, it, expect } from "vitest"
import { calculateFormulaLimit } from "@/features/budget/services/formula-engine"

describe("envelope_rollover", () => {
  it("acumula sobras; estouro zera a poupança do envelope", () => {
    // months=1 (base = mês anterior), lookback=2
    // spent (recente→antigo): [900, 800, 1000, 1100]
    // j=1: base histórica = slice(2,3)=[1000] → limite 1000; carry = max(0, 1000-800) = 200
    // j=0: base histórica = slice(1,2)=[800]  → limite 800;  carry = max(0, 200+800-900) = 100
    // resultado = base(simple_avg m=1 → 900) + 100 = 1000
    const h = { monthlySpent: [900, 800, 1000, 1100], monthlyIncome: [] }
    expect(
      calculateFormulaLimit("envelope_rollover", { months: 1, rolloverMonths: 2 }, h)
    ).toBe(1000)
  })
})

describe("sinking_fund", () => {
  it("dilui o valor-alvo pelo horizonte", () => {
    expect(
      calculateFormulaLimit("sinking_fund", { amount: 6000, monthsToTarget: 12 }, { monthlySpent: [1], monthlyIncome: [] })
    ).toBe(500)
  })
})
