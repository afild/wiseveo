import { describe, expect, it } from "vitest"
import { resolveChartChoice } from "../src/features/setup/lib/chart-choice"

/** Ou o banco inteiro, ou o modelo — nunca os dois. Quem decide é o estado do banco. */
describe("resolveChartChoice", () => {
  it("banco com dados → usar na íntegra", () => {
    expect(resolveChartChoice(true)).toBe("existing")
  })

  it("banco vazio → modelo padrão", () => {
    expect(resolveChartChoice(false)).toBe("template")
  })
})
