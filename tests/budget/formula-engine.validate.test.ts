import { describe, it, expect } from "vitest"
import { validateCustomExpression } from "@/features/budget/services/formula-engine"

describe("validateCustomExpression", () => {
  it("aceita expressão válida", () => {
    expect(validateCustomExpression("([MEDIA] + [DESVIO_P]) * 1.1").ok).toBe(true)
  })
  it("rejeita token desconhecido", () => {
    expect(validateCustomExpression("[MEDIA] + [DESVIOP]")).toEqual({ ok: false, errorCode: "unknown_token" })
  })
  it("rejeita sintaxe quebrada", () => {
    expect(validateCustomExpression("[MEDIA] + )(").ok).toBe(false)
  })
  // Nota: Tarefa 4.1 já converte Infinity→0 via Number.isFinite; a probe "1 + 0 * (...)" então
  // também devolve NaN→0 (0*Infinity=NaN per IEEE 754), portanto errorCode="syntax".
  it("rejeita divisão por zero (capturada como syntax via probe)", () => {
    expect(validateCustomExpression("[MEDIA] / 0")).toEqual({ ok: false, errorCode: "syntax" })
  })
})
