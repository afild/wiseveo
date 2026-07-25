import { describe, it, expect } from "vitest"
import { computeTotals } from "@/features/budget/lib/totals"
import type { BudgetItem } from "@/features/budget/types"

const base: Omit<BudgetItem, "id" | "limit" | "spent" | "paidAmount"> = {
  name: "x", originalName: "x", icon: "", scheduledAmount: 0, isGroup: true, hasHistory: true,
}
const item = (p: Partial<BudgetItem>): BudgetItem =>
  ({ ...base, id: "i", limit: 0, spent: 0, paidAmount: 0, ...p }) as BudgetItem

describe("computeTotals", () => {
  it("soma apenas includeInTotals; ignora categorias e custom cards", () => {
    const items = [
      item({ id: "grupo", limit: 2000, spent: 1200, paidAmount: 1000, projectedAmount: 500, includeInTotals: true }),
      item({ id: "categoria", limit: 800, spent: 500, paidAmount: 500, includeInTotals: false }),
      item({ id: "custom_1", limit: 2000, spent: 1200, paidAmount: 1000, includeInTotals: false }),
    ]
    const t = computeTotals(items)
    expect(t.totalLimit).toBe(2000)
    expect(t.totalSpent).toBe(1200)
    expect(t.totalPaid).toBe(1000)
    expect(t.totalProjected).toBe(500)
    expect(t.overallPct).toBe(60)
  })
  it("limite zero → pct 0", () => {
    expect(computeTotals([item({ includeInTotals: true })]).overallPct).toBe(0)
  })
})
