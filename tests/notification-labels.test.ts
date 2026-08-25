// O fuso do PROCESSO precisa ser diferente de UTC ANTES de qualquer import: é
// justamente isso que expõe o defeito que este arquivo guarda.
process.env.TZ = "America/Sao_Paulo"

import { describe, expect, it } from "vitest"
import { buildPeriodLabel } from "../src/features/notifications/services/bulletin.service"
import { utcDayRange, utcDaysBackRange, utcMonthRange } from "../src/features/notifications/lib/schedule"

/**
 * O rótulo do boletim é escrito a partir de instantes UTC que representam DIAS
 * de calendário. Se alguém voltar a formatá-los no relógio do servidor, o
 * boletim de julho chega intitulado "junho" em qualquer máquina a oeste de
 * Greenwich — e ninguém percebe na Vercel, que roda em UTC.
 */
describe("buildPeriodLabel", () => {
  it("o mensal nomeia o mês CERTO mesmo com o servidor fora de UTC", () => {
    const july = utcMonthRange(2026, 7)
    expect(buildPeriodLabel("monthlyDigest", july, "pt-BR")).toContain("julho")
    expect(buildPeriodLabel("monthlyDigest", july, "en-US")).toContain("July")
    expect(buildPeriodLabel("monthlyDigest", july, "es-419")).toContain("julio")
  })

  it("a janela do mês vira o ano certo na virada", () => {
    expect(buildPeriodLabel("monthlyDigest", utcMonthRange(2025, 12), "pt-BR")).toContain("2025")
    expect(buildPeriodLabel("monthlyDigest", utcMonthRange(2026, 1), "pt-BR")).toContain("2026")
  })

  it("o semanal mostra SETE dias, não oito", () => {
    const week = utcDaysBackRange(2026, 8, 24, 7)
    const label = buildPeriodLabel("weeklyDigest", week, "pt-BR")
    expect(label).toContain("18")
    expect(label).toContain("24")
    expect(label).not.toContain("17")
  })

  it("o diário nomeia o dia da pessoa, sem avançar para o seguinte", () => {
    const day = utcDayRange(2026, 8, 25)
    expect(buildPeriodLabel("dailyDigest", day, "pt-BR")).toContain("25")
    expect(buildPeriodLabel("dailyDigest", day, "pt-BR")).toContain("agosto")
  })
})
