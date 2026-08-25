import { describe, expect, it } from "vitest"
import {
  defaultNotificationPreferences,
  hasAnyNotificationEnabled,
  resolveNotificationPreferences,
  timeToMinutes,
} from "../src/features/notifications/lib/preferences"
import {
  DEFAULT_GRACE_MINUTES,
  getZonedParts,
  listDueJobs,
  localDateKey,
  previousPeriod,
  utcDayRange,
  utcDaysBackRange,
  utcDaysForwardRange,
  utcMonthRange,
} from "../src/features/notifications/lib/schedule"

/**
 * O relógio dos avisos, testado onde ele decide: fuso, janela de tolerância e
 * identidade da ocorrência. Tudo puro — nada aqui toca banco nem Telegram.
 */

function prefs(patch: Record<string, unknown>) {
  return resolveNotificationPreferences({ ...patch })
}

describe("resolveNotificationPreferences", () => {
  it("nasce tudo desligado, em UTC", () => {
    const resolved = resolveNotificationPreferences(undefined)
    expect(resolved).toEqual(defaultNotificationPreferences)
    expect(hasAnyNotificationEnabled(resolved)).toBe(false)
  })

  it("guarda o que é válido", () => {
    const resolved = prefs({
      timezone: "America/Sao_Paulo",
      dailyDigest: { enabled: true, time: "07:30" },
      weeklyDigest: { enabled: true, time: "18:00", weekday: 5 },
      monthlyDigest: { enabled: true, time: "09:00", day: 3 },
      billsReminder: { enabled: true, time: "20:00", daysAhead: 5 },
    })
    expect(resolved.timezone).toBe("America/Sao_Paulo")
    expect(resolved.dailyDigest).toEqual({ enabled: true, time: "07:30" })
    expect(resolved.weeklyDigest).toEqual({ enabled: true, time: "18:00", weekday: 5 })
    expect(resolved.monthlyDigest).toEqual({ enabled: true, time: "09:00", day: 3 })
    expect(resolved.billsReminder).toEqual({ enabled: true, time: "20:00", daysAhead: 5 })
    expect(hasAnyNotificationEnabled(resolved)).toBe(true)
  })

  it("o que está fora da régua vira o padrão, sem lançar", () => {
    const resolved = prefs({
      timezone: "Marte/Olimpo",
      dailyDigest: { enabled: "sim", time: "25:00" },
      weeklyDigest: { weekday: 9 },
      monthlyDigest: { day: 31 },
      billsReminder: { daysAhead: 90 },
      sentinel: { time: "8:00" },
    })
    expect(resolved.timezone).toBe("UTC")
    expect(resolved.dailyDigest).toEqual(defaultNotificationPreferences.dailyDigest)
    expect(resolved.weeklyDigest.weekday).toBe(defaultNotificationPreferences.weeklyDigest.weekday)
    // Dia 31 não existe em todo mês: o teto de 28 evita o boletim que nunca sai.
    expect(resolved.monthlyDigest.day).toBe(defaultNotificationPreferences.monthlyDigest.day)
    expect(resolved.billsReminder.daysAhead).toBe(
      defaultNotificationPreferences.billsReminder.daysAhead,
    )
    expect(resolved.sentinel.time).toBe(defaultNotificationPreferences.sentinel.time)
  })

  it("timeToMinutes lê o relógio de 24 horas", () => {
    expect(timeToMinutes("00:00")).toBe(0)
    expect(timeToMinutes("08:30")).toBe(510)
    expect(timeToMinutes("23:59")).toBe(1439)
  })
})

describe("getZonedParts", () => {
  it("lê o relógio de parede do fuso, não o do servidor", () => {
    const instant = new Date("2026-08-25T11:30:00Z")

    const saoPaulo = getZonedParts(instant, "America/Sao_Paulo")
    expect(saoPaulo).toMatchObject({ year: 2026, month: 8, day: 25, hour: 8, minute: 30, weekday: 2 })

    const tokyo = getZonedParts(instant, "Asia/Tokyo")
    expect(tokyo).toMatchObject({ year: 2026, month: 8, day: 25, hour: 20, minute: 30 })
  })

  it("a data local pode ser outro DIA que o de UTC", () => {
    const parts = getZonedParts(new Date("2026-08-25T02:00:00Z"), "America/Sao_Paulo")
    expect(localDateKey(parts)).toBe("2026-08-24")
    expect(parts).toMatchObject({ hour: 23, minute: 0, weekday: 1 })
  })

  it("acompanha o horário de verão sem tabela de deslocamento", () => {
    // Nova York às 8h locais: 12h UTC no verão, 13h UTC no inverno.
    expect(getZonedParts(new Date("2026-07-15T12:00:00Z"), "America/New_York").hour).toBe(8)
    expect(getZonedParts(new Date("2026-01-15T13:00:00Z"), "America/New_York").hour).toBe(8)
  })
})

describe("listDueJobs", () => {
  const daily = prefs({
    timezone: "America/Sao_Paulo",
    dailyDigest: { enabled: true, time: "08:00" },
  })

  it("vence do horário marcado até o fim da tolerância", () => {
    // 11:00Z = 08:00 em São Paulo.
    expect(listDueJobs(daily, new Date("2026-08-25T11:00:00Z"))).toEqual([
      { kind: "dailyDigest", occurrenceKey: "2026-08-25" },
    ])
    // Uma batida perdida ainda entrega dentro da janela.
    expect(listDueJobs(daily, new Date("2026-08-25T12:00:00Z"))).toHaveLength(1)
  })

  it("não vence antes da hora nem depois da janela", () => {
    expect(listDueJobs(daily, new Date("2026-08-25T10:45:00Z"))).toEqual([])
    // Exatamente na borda da tolerância (08:00 + 90 min = 09:30 local) já é
    // tarde: espera o dia seguinte, em vez de chegar fora de hora.
    expect(DEFAULT_GRACE_MINUTES).toBe(90)
    expect(listDueJobs(daily, new Date("2026-08-25T12:30:00Z"))).toEqual([])
  })

  it("a janela NÃO atravessa a meia-noite", () => {
    const lateNight = prefs({
      timezone: "America/Sao_Paulo",
      dailyDigest: { enabled: true, time: "23:50" },
    })
    // 02:50Z = 23:50 local do dia anterior — vence.
    expect(listDueJobs(lateNight, new Date("2026-08-26T02:50:00Z"))).toEqual([
      { kind: "dailyDigest", occurrenceKey: "2026-08-25" },
    ])
    // 03:30Z = 00:30 local do dia seguinte: ocorrência de ontem NÃO chega com a
    // data de hoje no cabeçalho.
    expect(listDueJobs(lateNight, new Date("2026-08-26T03:30:00Z"))).toEqual([])
  })

  it("aviso desligado nunca vence", () => {
    const off = prefs({
      timezone: "America/Sao_Paulo",
      dailyDigest: { enabled: false, time: "08:00" },
    })
    expect(listDueJobs(off, new Date("2026-08-25T11:00:00Z"))).toEqual([])
  })

  it("o semanal só sai no dia da semana escolhido", () => {
    // 2026-08-25 é terça (2); 2026-08-24 é segunda (1).
    const weekly = prefs({
      timezone: "America/Sao_Paulo",
      weeklyDigest: { enabled: true, time: "08:00", weekday: 1 },
    })
    expect(listDueJobs(weekly, new Date("2026-08-25T11:00:00Z"))).toEqual([])
    expect(listDueJobs(weekly, new Date("2026-08-24T11:00:00Z"))).toEqual([
      { kind: "weeklyDigest", occurrenceKey: "2026-08-24" },
    ])
  })

  it("o mensal só sai no dia do mês escolhido, e a ocorrência é o MÊS", () => {
    const monthly = prefs({
      timezone: "America/Sao_Paulo",
      monthlyDigest: { enabled: true, time: "08:00", day: 25 },
    })
    expect(listDueJobs(monthly, new Date("2026-08-24T11:00:00Z"))).toEqual([])
    expect(listDueJobs(monthly, new Date("2026-08-25T11:00:00Z"))).toEqual([
      { kind: "monthlyDigest", occurrenceKey: "2026-08" },
    ])
  })

  it("vários avisos no mesmo horário saem juntos", () => {
    const all = prefs({
      timezone: "UTC",
      dailyDigest: { enabled: true, time: "08:00" },
      sentinel: { enabled: true, time: "08:00" },
      billsReminder: { enabled: true, time: "08:00", daysAhead: 2 },
    })
    const due = listDueJobs(all, new Date("2026-08-25T08:00:00Z")).map((job) => job.kind)
    expect(due.sort()).toEqual(["billsReminder", "dailyDigest", "sentinel"])
  })
})

describe("intervalos de calendário", () => {
  it("o dia local vira o MESMO dia em UTC", () => {
    const range = utcDayRange(2026, 8, 25)
    expect(range.from.toISOString()).toBe("2026-08-25T00:00:00.000Z")
    expect(range.to.toISOString()).toBe("2026-08-25T23:59:59.999Z")
  })

  it("sete dias para trás incluem o dia informado", () => {
    const range = utcDaysBackRange(2026, 8, 24, 7)
    expect(range.from.toISOString()).toBe("2026-08-18T00:00:00.000Z")
    expect(range.to.toISOString()).toBe("2026-08-24T23:59:59.999Z")
  })

  it("sete dias para a frente incluem o dia informado", () => {
    const range = utcDaysForwardRange(2026, 8, 25, 7)
    expect(range.from.toISOString()).toBe("2026-08-25T00:00:00.000Z")
    expect(range.to.toISOString()).toBe("2026-08-31T23:59:59.999Z")
  })

  it("o mês fecha no último dia, inclusive em fevereiro", () => {
    expect(utcMonthRange(2026, 2).to.toISOString()).toBe("2026-02-28T23:59:59.999Z")
    expect(utcMonthRange(2024, 2).to.toISOString()).toBe("2024-02-29T23:59:59.999Z")
  })

  it("o mês anterior vira o mesmo YYYYMM do resto do sistema", () => {
    expect(previousPeriod(2026, 8)).toBe("202607")
    expect(previousPeriod(2026, 1)).toBe("202512")
  })
})
