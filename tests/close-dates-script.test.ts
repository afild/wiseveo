import { describe, expect, it } from "vitest"
import { planCloseDates } from "../scripts/lib/close-dates-plan"

/**
 * DECISÃO PURA do script de fechamento inicial (scripts/close-dates.ts).
 *
 * O script roda uma única vez, no banco de verdade do dono, com quase dois anos de histórico.
 * Toda a decisão de "simular, gravar ou recusar" mora aqui justamente para poder ser conferida
 * sem banco nenhum. Duas coisas que o teste protege e que ninguém quer descobrir na hora:
 * o padrão é SIMULAR (nada é gravado sem `--apply`), e recuar o corte nunca é aceito, nem por
 * engano de digitação, porque reabrir data é gesto do app, com PIN, e não de um script.
 */
describe("planCloseDates", () => {
  const base = { closedThrough: null as string | null, through: "2026-08-31", blockersCount: 0, apply: false }

  it("simula quando não há corte, não há bloqueador e ninguém pediu --apply", () => {
    expect(planCloseDates(base)).toEqual({ action: "simulate" })
  })

  it("aplica quando não há corte, não há bloqueador e veio --apply", () => {
    expect(planCloseDates({ ...base, apply: true })).toEqual({ action: "apply" })
  })

  it("recusa por bloqueadores na simulação, antes mesmo de alguém pedir --apply", () => {
    expect(planCloseDates({ ...base, blockersCount: 7 })).toEqual({ action: "refuse", reason: "blockers" })
  })

  it("recusa por bloqueadores com --apply", () => {
    expect(planCloseDates({ ...base, blockersCount: 1, apply: true })).toEqual({ action: "refuse", reason: "blockers" })
  })

  it("recusa recuar o corte: data pedida antes do corte atual é reabertura", () => {
    expect(planCloseDates({ ...base, closedThrough: "2026-08-31", through: "2026-08-30", apply: true })).toEqual({
      action: "refuse",
      reason: "wouldReopen",
    })
  })

  it("recusa como nada a fazer quando a data pedida é o corte atual", () => {
    expect(planCloseDates({ ...base, closedThrough: "2026-08-31", through: "2026-08-31", apply: true })).toEqual({
      action: "refuse",
      reason: "noop",
    })
  })

  it("avança o corte quando a data pedida é depois do corte atual", () => {
    expect(planCloseDates({ ...base, closedThrough: "2026-08-31", through: "2026-09-01", apply: true })).toEqual({
      action: "apply",
    })
  })

  it("reabertura vem antes de bloqueador: o motivo dito é o que o dono precisa ouvir", () => {
    expect(planCloseDates({ closedThrough: "2026-08-31", through: "2024-10-03", blockersCount: 42, apply: true })).toEqual({
      action: "refuse",
      reason: "wouldReopen",
    })
  })

  it("nada a fazer vem antes de bloqueador: o corte já está lá, não há o que gravar", () => {
    expect(planCloseDates({ closedThrough: "2026-08-31", through: "2026-08-31", blockersCount: 42, apply: true })).toEqual({
      action: "refuse",
      reason: "noop",
    })
  })

  it("compara datas como texto YYYY-MM-DD, então a virada de ano não engana", () => {
    expect(planCloseDates({ closedThrough: "2025-12-31", through: "2026-01-01", blockersCount: 0, apply: true })).toEqual({
      action: "apply",
    })
    expect(planCloseDates({ closedThrough: "2026-01-01", through: "2025-12-31", blockersCount: 0, apply: true })).toEqual({
      action: "refuse",
      reason: "wouldReopen",
    })
  })
})
