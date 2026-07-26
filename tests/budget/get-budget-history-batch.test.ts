import { describe, it, expect, vi, beforeEach } from "vitest"

const queryRaw = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRawUnsafe: (...args: unknown[]) => queryRaw(...args) },
}))

import { getBudgetHistoryBatch } from "@/features/budget/services/get-budget-history-batch"

describe("getBudgetHistoryBatch", () => {
  beforeEach(() => queryRaw.mockReset())

  it("monta mapas por grupo e categoria com despesas no slot correto", async () => {
    // referência = 01/07/2026, months=3 → slots: jun/26, mai/26, abr/26
    // Fixtures realistas: COD_GRU e COD_CAT são NOT NULL no schema
    queryRaw
      .mockResolvedValueOnce([
        { m: 6, y: 2026, g: 10, c: "ALI", total: 1500 },
        { m: 6, y: 2026, g: 10, c: "MER", total: 500 },
        { m: 5, y: 2026, g: 10, c: "ALI", total: 1200 },
      ]) // expenses
      .mockResolvedValueOnce([
        { m: 6, y: 2026, total: 3000 },
      ]) // income

    const result = await getBudgetHistoryBatch("user-1", new Date(2026, 6, 1), 3)

    expect(result.monthLabels).toEqual(["2026-06", "2026-05", "2026-04"])
    expect(result.targetMonth).toBe("2026-07")
    expect(result.income).toEqual([3000, 0, 0])

    // Grupo acumula todas as categorias: 1500+500=2000 no slot 0
    const grp = result.byGroup.get(10)!
    expect(grp.monthlySpent).toEqual([2000, 1200, 0])
    expect(grp.monthlyIncome).toEqual([3000, 0, 0])

    // Cada categoria individualmente
    const catALI = result.byCategory.get("ALI")!
    expect(catALI.monthlySpent).toEqual([1500, 1200, 0])

    const catMER = result.byCategory.get("MER")!
    expect(catMER.monthlySpent).toEqual([500, 0, 0])
  })

  it("retorna mapas vazios e income zeros quando não há transações", async () => {
    queryRaw
      .mockResolvedValueOnce([]) // expenses
      .mockResolvedValueOnce([]) // income

    const result = await getBudgetHistoryBatch("user-1", new Date(2026, 6, 1), 2)

    expect(result.byGroup.size).toBe(0)
    expect(result.byCategory.size).toBe(0)
    expect(result.income).toEqual([0, 0])
  })
})
