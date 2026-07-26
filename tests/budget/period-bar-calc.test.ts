import { describe, it, expect } from "vitest"
import {
  calcSegments,
  computeClientPacing,
  getMonthPosition,
  LIMIT_RATIO,
} from "@/features/budget/lib/period-bar-calc"

describe("calcSegments", () => {
  it("distribui paid e scheduled dentro do limite", () => {
    const r = calcSegments(600, 200, 0, 1000)
    // paid = (600/1000) * 72 = 43.2; scheduled = (200/1000) * 72 = 14.4
    expect(r.paidPct).toBeCloseTo(43.2)
    expect(r.scheduledPct).toBeCloseTo(14.4)
    expect(r.projectedPct).toBe(0)
    expect(r.overflowPct).toBe(0)
  })

  it("limita segments ao LIMIT_RATIO e calcula overflow", () => {
    const r = calcSegments(1100, 200, 0, 1000)
    // paid excede o limite: paidPct = 72 (clamp), overflow = (1300/1000 * 72) - 72 = 21.6
    expect(r.paidPct).toBeCloseTo(LIMIT_RATIO)
    expect(r.scheduledPct).toBe(0) // sem espaço restante
    expect(r.overflowPct).toBeCloseTo(21.6)
  })

  it("retorna zeros quando limit = 0", () => {
    const r = calcSegments(100, 50, 30, 0)
    expect(r.paidPct).toBe(0)
    expect(r.scheduledPct).toBe(0)
    expect(r.projectedPct).toBe(0)
    expect(r.overflowPct).toBe(0)
  })

  it("scheduled é clampeado ao espaço restante após paid", () => {
    const r = calcSegments(800, 400, 0, 1000)
    // paid = 57.6, restante = 72 - 57.6 = 14.4, scheduled clamp = 14.4
    expect(r.paidPct).toBeCloseTo(57.6)
    expect(r.scheduledPct).toBeCloseTo(14.4)
  })

  it("projected só ocupa espaço restante após paid+scheduled", () => {
    const r = calcSegments(300, 200, 200, 1000)
    // paid=21.6, sched=14.4, remaining=36, projected=(200/1000)*72=14.4 — cabe
    expect(r.projectedPct).toBeCloseTo(14.4)
  })
})

describe("computeClientPacing", () => {
  it("pacing = 1 quando usagePct = monthPct", () => {
    // dia 15 de 30 = 50%; gasto 50% → pacing = 1
    const r = computeClientPacing(50, 15, 30, 500, 1000)
    expect(r.pacing).toBeCloseTo(1)
    expect(r.zone).toBe("good")
    expect(r.projectedOverrunDay).toBeNull()
  })

  it("pacing > 1 com risco de estouro calcula projectedOverrunDay", () => {
    // dia 10 de 30; gastou 70% (totalPaid=700 de 1000); dailyRate=70/dia
    // overrunDay = ceil(1000/70) = 15 — dentro do mês → não nulo
    const r = computeClientPacing(70, 10, 30, 700, 1000)
    expect(r.pacing).toBeGreaterThan(1)
    expect(r.projectedOverrunDay).toBe(15)
    expect(r.zone).toBe("critical")
  })

  it("não retorna projectedOverrunDay quando não há risco", () => {
    // gastou 30% no dia 10 de 30 → pacing=0.9 → sem risco
    const r = computeClientPacing(30, 10, 30, 300, 1000)
    expect(r.projectedOverrunDay).toBeNull()
    expect(r.zone).toBe("good")
  })

  it("day=0 retorna pacing=0 sem erro", () => {
    const r = computeClientPacing(0, 0, 31, 0, 1000)
    expect(r.pacing).toBe(0)
    expect(r.zone).toBe("good")
  })
})

describe("getMonthPosition", () => {
  it("usa UTC para o dia e o total de dias do mês", () => {
    expect(getMonthPosition(new Date("2026-07-26T12:00:00Z"))).toEqual({
      dayOfMonth: 26,
      daysInMonth: 31,
    })
    expect(getMonthPosition(new Date("2026-02-05T00:00:00Z"))).toEqual({
      dayOfMonth: 5,
      daysInMonth: 28,
    })
  })

  it("não muda de dia conforme o fuso do cliente — SSR e cliente concordam", () => {
    // Mesmo instante; em UTC-3 a hora local seria dia 25, mas UTC mantém 26.
    const late = new Date("2026-07-26T02:00:00Z")
    expect(getMonthPosition(late).dayOfMonth).toBe(26)
  })
})
