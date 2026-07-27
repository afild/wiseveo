import { describe, it, expect } from "vitest"
import { parseCalendarDate, resolveBudgetRange } from "@/features/budget/lib/period-range"

/** Quantos meses inteiros o range cobre — é o multiplicador do limite na página. */
const monthsInRange = (from: Date, to: Date) =>
  (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1

describe("parseCalendarDate", () => {
  it("lê a data de calendário no fuso local (meia-noite local, não UTC)", () => {
    const d = parseCalendarDate("2026-07-31")!
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 6, 31])
    expect(d.getHours()).toBe(0)
  })

  it("aceita mês sem dia (\"2026-07\") como o primeiro dia do mês", () => {
    const d = parseCalendarDate("2026-07")!
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 6, 1])
  })

  it("rejeita instante com hora — é o formato que dobrava os totais", () => {
    expect(parseCalendarDate("2026-07-31T23:59:59.999Z")).toBeNull()
    expect(parseCalendarDate("2026-08-01T02:59:59.999Z")).toBeNull()
  })

  it("devolve null para vazio e para lixo", () => {
    expect(parseCalendarDate(null)).toBeNull()
    expect(parseCalendarDate("")).toBeNull()
    expect(parseCalendarDate("mês que vem")).toBeNull()
    expect(parseCalendarDate("2026-13-01")).toBeNull()
  })
})

describe("resolveBudgetRange", () => {
  const fallback = new Date(2026, 6, 27) // 27/07/2026

  it("julho pedido é julho entregue — um mês, em qualquer fuso do servidor", () => {
    const r = resolveBudgetRange("2026-07-01", "2026-07-31", fallback)!
    expect([r.from.getFullYear(), r.from.getMonth(), r.from.getDate()]).toEqual([2026, 6, 1])
    expect([r.to.getFullYear(), r.to.getMonth(), r.to.getDate()]).toEqual([2026, 6, 31])
    expect(monthsInRange(r.from, r.to)).toBe(1)
  })

  it("regressão: instante do fim do mês é recusado, não vira mês seguinte", () => {
    // O cliente antigo mandava o instante do fim de julho, que em UTC-3 chega
    // como 01/08 — o servidor em UTC fechava o mês em 31/08 e dobrava os
    // totais. Agora a rota devolve 400 e a página mantém o mês corrente.
    expect(resolveBudgetRange("2026-07-01", "2026-08-01T02:59:59.999Z", fallback)).toBeNull()
  })

  it("fecha meses inteiros mesmo com datas no meio do mês", () => {
    const r = resolveBudgetRange("2026-07-14", "2026-09-03", fallback)!
    expect([r.from.getMonth(), r.from.getDate()]).toEqual([6, 1])
    expect([r.to.getMonth(), r.to.getDate()]).toEqual([8, 30])
    expect(monthsInRange(r.from, r.to)).toBe(3)
  })

  it("sem parâmetros, usa o mês do fallback", () => {
    const r = resolveBudgetRange(null, null, fallback)!
    expect(monthsInRange(r.from, r.to)).toBe(1)
    expect(r.from.getMonth()).toBe(6)
  })

  it("só o início: o fim vira o fim daquele mesmo mês", () => {
    const r = resolveBudgetRange("2026-03-10", null, fallback)!
    expect([r.from.getMonth(), r.to.getMonth()]).toEqual([2, 2])
    expect(r.to.getDate()).toBe(31)
  })

  it("parâmetro ilegível devolve null (a rota responde 400)", () => {
    expect(resolveBudgetRange("ontem", "2026-07-31", fallback)).toBeNull()
    expect(resolveBudgetRange("2026-07-01", "amanhã", fallback)).toBeNull()
  })
})
