// O fuso do PROCESSO precisa ser diferente de UTC ANTES de qualquer import: é
// justamente isso que expõe o defeito que este arquivo guarda.
process.env.TZ = "America/Sao_Paulo"

import { describe, expect, it } from "vitest"
import {
  dayLabel,
  monthLabel,
  shortDay,
} from "../src/features/notifications/services/bulletin-dossier.service"

/**
 * Os rótulos do boletim são escritos a partir de instantes UTC que representam
 * DIAS de calendário. Se alguém voltar a formatá-los no relógio do servidor, o
 * boletim de julho chega intitulado "junho" em qualquer máquina a oeste de
 * Greenwich — e ninguém percebe na Vercel, que roda em UTC.
 */
describe("rótulos de período do boletim", () => {
  it("o mês nomeia o mês CERTO mesmo com o servidor fora de UTC", () => {
    expect(monthLabel("202607", "pt-BR")).toContain("julho")
    expect(monthLabel("202607", "en-US")).toContain("July")
    expect(monthLabel("202607", "es-419")).toContain("julio")
  })

  it("a virada de ano não recua para dezembro do ano anterior", () => {
    expect(monthLabel("202601", "pt-BR")).toContain("2026")
    expect(monthLabel("202512", "pt-BR")).toContain("2025")
  })

  it("o dia é o dia da pessoa, sem avançar nem recuar", () => {
    const day = new Date(Date.UTC(2026, 7, 25))
    expect(dayLabel(day, "pt-BR")).toContain("25")
    expect(dayLabel(day, "pt-BR")).toContain("agosto")
    expect(shortDay(day, "pt-BR")).toBe("25/08")
  })

  it("o primeiro dia do mês não vira o último do mês anterior", () => {
    // O caso exato do defeito: meia-noite UTC do dia 1 é dia 31 às 21h em
    // São Paulo, e era isso que o formatador antigo lia.
    expect(shortDay(new Date(Date.UTC(2026, 7, 1)), "pt-BR")).toBe("01/08")
  })
})
