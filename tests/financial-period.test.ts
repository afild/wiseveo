import { describe, it, expect } from "vitest"
import { endOfUTCDay, periodFromDate, startOfUTCDay } from "../src/lib/financial"

/**
 * Regressão: `periodFromDate` lia componentes LOCAIS enquanto todo o resto do
 * módulo (normalizeDate, startOfUTCDay, endOfUTCDay) é UTC. Em fusos negativos
 * (UTC-3), o início do dia 01/07 em UTC cai em 30/06 local — e a DRE, que filtra
 * `period` entre `periodFromDate(from)` e `periodFromDate(to)`, puxava o mês
 * anterior inteiro (na demo: 143 lançamentos em vez de 72).
 */
describe("periodFromDate — fronteiras de intervalo em UTC", () => {
  it("início do dia UTC do dia 1 continua no mês do dia 1", () => {
    const from = startOfUTCDay(new Date(Date.UTC(2026, 6, 1, 12, 0, 0)))
    expect(periodFromDate(from)).toBe("202607")
  })

  it("fim do dia UTC do último dia continua no mesmo mês", () => {
    const to = endOfUTCDay(new Date(Date.UTC(2026, 6, 31, 12, 0, 0)))
    expect(periodFromDate(to)).toBe("202607")
  })

  it("data do dataset (meio-dia UTC) mapeia para o próprio mês", () => {
    expect(periodFromDate(new Date(Date.UTC(2025, 0, 1, 12, 0, 0)))).toBe("202501")
    expect(periodFromDate(new Date(Date.UTC(2027, 11, 31, 12, 0, 0)))).toBe("202712")
  })

  it("aceita período já pronto e string de data sem deslocar o mês", () => {
    expect(periodFromDate("202603")).toBe("202603")
    expect(periodFromDate("2026-03-01")).toBe("202603")
  })

  it("data inválida cai no mês corrente em vez de quebrar", () => {
    expect(periodFromDate("não é data")).toMatch(/^\d{6}$/)
  })
})
