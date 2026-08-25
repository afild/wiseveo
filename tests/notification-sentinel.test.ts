import { describe, expect, it } from "vitest"
import { collectSentinelAlerts } from "../src/features/notifications/services/sentinel.service"
import type { NotificationContext } from "../src/features/notifications/types/notifications.types"
import type { InsightsData, KpiZone } from "../src/features/insights/types"

/**
 * A sentinela existe para CALAR quase sempre. Estes testes guardam essa
 * promessa: sem nada fora do normal, nenhuma linha sai; e a assinatura só muda
 * quando o quadro muda de verdade (é ela que impede o mesmo alerta diário).
 */

// Tradutor de mentira: devolve a chave e os valores, o suficiente para conferir
// O QUE foi dito sem depender do texto de nenhum idioma.
const ctx = {
  locale: "pt-BR",
  t: ((key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key) as unknown,
  monetary: { formatNumberValue: (value: number) => value.toFixed(2) },
} as unknown as NotificationContext

const quiet: InsightsData = {
  budgetPacing: {
    state: "ok",
    zone: "good",
    monthPct: 50,
    pacing: 0.9,
    projectedOverrunDay: null,
    totalLimit: 1000,
    totalSpent: 400,
    usagePct: 40,
    worstItemName: null,
    worstItemPct: null,
  },
  burnRate: { state: "ok", zone: "good", baselineMonthly: 100, deltaPct: 0, recentMonthly: 100, series: [] },
  cashProjection: {
    state: "ok",
    zone: "good",
    accountName: null,
    daysToNegative: null,
    horizonDays: 60,
    projectedDate: null,
  },
  emergencyRunway: {
    state: "ok",
    zone: "good",
    avgMonthlyExpense: 100,
    coverageMonths: 12,
    incomeCvPct: 5,
    targetMonths: 6,
  },
  fixedCommitment: { state: "ok", zone: "good", avgMonthlyIncome: 1000, fixedMonthly: 200, ratioPct: 20 },
  monthEndForecast: {
    state: "ok",
    zone: "good",
    avgMonthlyIncome: 1000,
    bookedMonth: 300,
    diffuseRemainder: 100,
    p25: 300,
    p75: 500,
    projectedOutflow: 400,
  },
  overdueCost: { state: "ok", zone: "good", count: 0, estimatedCost: 0, oldestDays: 0, totalAmount: 0 },
  personalRunway: { state: "ok", zone: "good", balanceToday: 5000, netMonthly: 200, runwayMonths: null },
  recurringLoad: {
    state: "ok",
    zone: "good",
    annualTotal: 1200,
    count: 3,
    incomeSharePct: 10,
    monthlyTotal: 100,
  },
  safeToSpend: {
    state: "ok",
    zone: "good",
    available: 800,
    balanceToday: 1000,
    committed30d: 200,
    daysLeftInMonth: 10,
    perDay: 80,
  },
  savingsRate: { state: "ok", zone: "good", avg12mRatePct: 20, currentMonthRatePct: 25, series: [] },
  spendingAnomaly: { state: "ok", zone: "good", anomalies: [], count: 0 },
}

function withZone<T extends { zone: KpiZone }>(kpi: T, zone: KpiZone): T {
  return { ...kpi, zone }
}

describe("collectSentinelAlerts", () => {
  it("tudo normal → silêncio", () => {
    const result = collectSentinelAlerts(quiet, ctx)
    expect(result.lines).toEqual([])
    expect(result.signature).toBe("")
  })

  it("dados insuficientes NÃO viram alerta", () => {
    // Histórico curto deixa o indicador em "insufficient": afirmar qualquer
    // coisa aí seria inventar. O zone crítico sozinho não basta.
    const data: InsightsData = {
      ...quiet,
      spendingAnomaly: { state: "insufficient", zone: "critical", anomalies: [], count: 3 },
      budgetPacing: { ...quiet.budgetPacing, state: "empty", zone: "critical" },
    }
    expect(collectSentinelAlerts(data, ctx).lines).toEqual([])
  })

  it("gasto atípico, conta vencida e orçamento no vermelho viram linhas", () => {
    const data: InsightsData = {
      ...quiet,
      spendingAnomaly: {
        state: "ok",
        zone: "warning",
        count: 1,
        anomalies: [{ name: "Mercado", amount: 900, medianAmount: 400 }],
      },
      overdueCost: { state: "ok", zone: "critical", count: 2, estimatedCost: 30, oldestDays: 9, totalAmount: 250 },
      budgetPacing: withZone({ ...quiet.budgetPacing, usagePct: 95, totalSpent: 950 }, "critical"),
    }

    const result = collectSentinelAlerts(data, ctx)
    expect(result.lines).toHaveLength(3)
    expect(result.lines[0]).toContain("sentinel.anomaly")
    expect(result.lines[0]).toContain("Mercado")
    expect(result.signature).toContain("anomaly:1")
    expect(result.signature).toContain("overdue:2")
    expect(result.signature).toContain("budget:19")
  })

  it("orçamento em ATENÇÃO não acorda a sentinela", () => {
    // Começo de mês com aluguel pago no dia 1 marca "warning" todo mês; avisar
    // disso seria o falso alarme que faz a pessoa parar de ler.
    const data: InsightsData = {
      ...quiet,
      budgetPacing: withZone({ ...quiet.budgetPacing, usagePct: 30 }, "warning"),
    }
    expect(collectSentinelAlerts(data, ctx).lines).toEqual([])
  })

  it("a assinatura muda quando o quadro piora — e só então", () => {
    const base: InsightsData = {
      ...quiet,
      overdueCost: { state: "ok", zone: "critical", count: 2, estimatedCost: 30, oldestDays: 9, totalAmount: 250 },
    }
    const same: InsightsData = {
      ...base,
      // Mesmo número de contas vencidas, outro valor: o quadro é o mesmo.
      overdueCost: { ...base.overdueCost, totalAmount: 251 },
    }
    const worse: InsightsData = {
      ...base,
      overdueCost: { ...base.overdueCost, count: 3 },
    }

    const first = collectSentinelAlerts(base, ctx).signature
    expect(collectSentinelAlerts(same, ctx).signature).toBe(first)
    expect(collectSentinelAlerts(worse, ctx).signature).not.toBe(first)
  })
})
