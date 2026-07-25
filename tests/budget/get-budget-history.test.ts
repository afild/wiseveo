import { describe, it, expect, vi, beforeEach } from "vitest"

const queryRaw = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRawUnsafe: (...args: unknown[]) => queryRaw(...args) },
}))

import { getBudgetHistory } from "@/features/budget/services/get-budget-history"

describe("getBudgetHistory", () => {
  beforeEach(() => queryRaw.mockReset())

  it("com referência = início do range, slot 0 é o mês imediatamente anterior", async () => {
    // Range visualizado: julho/2026 → referência (pós-correção D1) = filterFrom = 01/07/2026.
    queryRaw
      .mockResolvedValueOnce([
        { m: 6, y: 2026, total: 1500 },
        { m: 5, y: 2026, total: 1200 },
        { m: 4, y: 2026, total: 1000 },
      ]) // despesas
      .mockResolvedValueOnce([]) // receitas
    const h = await getBudgetHistory("user-1", new Date(2026, 6, 1), 3, { type: "group", code: 10 })
    expect(h.monthlySpent).toEqual([1500, 1200, 1000]) // jun, mai, abr — junho INCLUÍDO
    expect(h.monthlyIncome).toEqual([0, 0, 0])
  })
})
