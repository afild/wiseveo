import { describe, it, expect } from "vitest"

describe("harness", () => {
  it("resolve o alias @", async () => {
    const mod = await import("@/features/budget/services/formula-engine")
    expect(typeof mod.calculateFormulaLimit).toBe("function")
  })
})
