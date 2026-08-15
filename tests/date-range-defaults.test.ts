import { describe, it, expect } from "vitest"
import { endOfMonth, startOfDay, startOfMonth } from "date-fns"
import {
  getDefaultDateRange,
  getHydrationSafeDateRange,
  isSingleDayScope,
} from "../src/lib/date-range-defaults"

/**
 * Período inicial por rota quando o navegador não tem nada salvo: /transactions
 * abre em "hoje" (dia único, como o atalho "Hoje" do DatePicker); todo o resto
 * abre no mês corrente inteiro. Só vale como fallback — quem já tem período
 * salvo não passa por aqui.
 */
describe("getDefaultDateRange — período inicial por rota", () => {
  const now = new Date(2026, 7, 15, 14, 37, 12) // 15/08/2026 14:37 local

  it("/transactions abre no dia de hoje, dia único", () => {
    const range = getDefaultDateRange("/transactions", now)
    expect(range.from.getTime()).toBe(startOfDay(now).getTime())
    expect(range.to.getTime()).toBe(startOfDay(now).getTime())
  })

  it("demais rotas abrem no mês corrente inteiro", () => {
    for (const scope of ["/dashboard", "/budget", "/analysis", "global", "/transactions/anything"]) {
      const range = getDefaultDateRange(scope, now)
      expect(range.from.getTime()).toBe(startOfMonth(now).getTime())
      expect(range.to.getTime()).toBe(endOfMonth(now).getTime())
    }
  })

  it("isSingleDayScope só reconhece a rota exata", () => {
    expect(isSingleDayScope("/transactions")).toBe(true)
    expect(isSingleDayScope("/transactions/")).toBe(false)
    expect(isSingleDayScope("/dashboard")).toBe(false)
  })

  it("sem `now` explícito usa a data atual (não quebra)", () => {
    const range = getDefaultDateRange("/dashboard")
    expect(range.from <= range.to).toBe(true)
  })
})

/**
 * Estado inicial do DateRangeProvider precisa ser a MESMA data-calendário no servidor
 * (UTC) e no navegador (fuso local), senão o texto do DatePicker diverge e o React
 * acusa erro de hidratação — com "hoje" dia único, isso aconteceria toda noite em
 * fusos a oeste de UTC. A âncora é o dia UTC de `now`, expresso como meia-noite local.
 */
describe("getHydrationSafeDateRange — âncora no dia-calendário UTC", () => {
  // 16/08/2026 01:30 UTC = ainda 15/08 à noite em UTC-3 (São Paulo)
  const lateEvening = new Date(Date.UTC(2026, 7, 16, 1, 30, 0))

  it("/transactions: dia único = dia UTC de `now`, à meia-noite local", () => {
    const range = getHydrationSafeDateRange("/transactions", lateEvening)
    expect(range.from.getFullYear()).toBe(lateEvening.getUTCFullYear())
    expect(range.from.getMonth()).toBe(lateEvening.getUTCMonth())
    expect(range.from.getDate()).toBe(lateEvening.getUTCDate())
    expect(range.from.getHours()).toBe(0)
    expect(range.to.getTime()).toBe(range.from.getTime())
  })

  it("demais rotas: mês do dia UTC de `now`", () => {
    const range = getHydrationSafeDateRange("/dashboard", lateEvening)
    expect(range.from.getMonth()).toBe(lateEvening.getUTCMonth())
    expect(range.from.getDate()).toBe(1)
    expect(range.to.getMonth()).toBe(lateEvening.getUTCMonth())
  })

  it("é independente do fuso: mesmo resultado que calcular a partir dos componentes UTC", () => {
    const anchor = new Date(
      lateEvening.getUTCFullYear(),
      lateEvening.getUTCMonth(),
      lateEvening.getUTCDate(),
    )
    expect(getHydrationSafeDateRange("/transactions", lateEvening)).toEqual(
      getDefaultDateRange("/transactions", anchor),
    )
  })
})
