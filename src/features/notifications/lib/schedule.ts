import {
  type NotificationKind,
  type NotificationPreferences,
  timeToMinutes,
} from "./preferences"

/**
 * O relógio, em código puro e testável: dado "agora" e as preferências de uma
 * pessoa, quais avisos vencem NESTE momento.
 *
 * O despertador externo bate a cada 15 minutos, e uma batida pode falhar. Por
 * isso "vencido" não é um instante exato, e sim uma JANELA: do horário marcado
 * até `graceMinutes` depois. A garantia de não repetir NÃO mora aqui — mora na
 * chave única de `notification_deliveries` (delivery-ledger.service.ts). Aqui só
 * decide o que caberia enviar; lá se decide o que ainda não foi enviado.
 *
 * A janela não atravessa a meia-noite de propósito: um boletim marcado para
 * 23:50 tem dez minutos de folga, não duas horas do dia seguinte — senão a
 * ocorrência de ontem chegaria com a data de hoje no cabeçalho.
 */

export const DEFAULT_GRACE_MINUTES = 90

export interface ZonedParts {
  year: number
  month: number // 1-12
  day: number // 1-31
  hour: number // 0-23
  minute: number // 0-59
  /** 0 = domingo … 6 = sábado. */
  weekday: number
  /** Minutos desde a meia-noite local. */
  minutesOfDay: number
}

/**
 * As partes do relógio de parede naquele fuso. O locale passado ao formatador é
 * "en-US" apenas para garantir dígitos ocidentais e o ciclo de 24 horas: nada
 * daqui é exibido a ninguém — é aritmética de calendário, não texto de tela.
 * O dia da semana NÃO é lido do formatador (viria traduzido); sai da própria
 * data já resolvida.
 */
export function getZonedParts(instant: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })

  const parts: Record<string, string> = {}
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = part.value
  }

  const year = Number(parts.year)
  const month = Number(parts.month)
  const day = Number(parts.day)
  // "24" ainda aparece em alguns motores para a meia-noite, mesmo com h23.
  const hour = Number(parts.hour) % 24
  const minute = Number(parts.minute)

  return {
    year,
    month,
    day,
    hour,
    minute,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    minutesOfDay: hour * 60 + minute,
  }
}

const pad = (value: number) => String(value).padStart(2, "0")

/** "YYYY-MM-DD" da data LOCAL — é a identidade da ocorrência do dia. */
export function localDateKey(parts: ZonedParts): string {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
}

/** "YYYY-MM" da data local — a identidade da ocorrência do mês. */
export function localMonthKey(parts: ZonedParts): string {
  return `${parts.year}-${pad(parts.month)}`
}

export interface DueJob {
  kind: NotificationKind
  /** Identidade da ocorrência; junto com (usuário, tipo) forma a chave única. */
  occurrenceKey: string
}

function isWithinWindow(parts: ZonedParts, time: string, graceMinutes: number): boolean {
  const scheduled = timeToMinutes(time)
  const elapsed = parts.minutesOfDay - scheduled
  return elapsed >= 0 && elapsed < graceMinutes
}

export function listDueJobs(
  preferences: NotificationPreferences,
  now: Date,
  graceMinutes: number = DEFAULT_GRACE_MINUTES,
): DueJob[] {
  const parts = getZonedParts(now, preferences.timezone)
  const dayKey = localDateKey(parts)
  const due: DueJob[] = []

  if (preferences.dailyDigest.enabled && isWithinWindow(parts, preferences.dailyDigest.time, graceMinutes)) {
    due.push({ kind: "dailyDigest", occurrenceKey: dayKey })
  }

  if (
    preferences.weeklyDigest.enabled &&
    parts.weekday === preferences.weeklyDigest.weekday &&
    isWithinWindow(parts, preferences.weeklyDigest.time, graceMinutes)
  ) {
    due.push({ kind: "weeklyDigest", occurrenceKey: dayKey })
  }

  if (
    preferences.monthlyDigest.enabled &&
    parts.day === preferences.monthlyDigest.day &&
    isWithinWindow(parts, preferences.monthlyDigest.time, graceMinutes)
  ) {
    due.push({ kind: "monthlyDigest", occurrenceKey: localMonthKey(parts) })
  }

  if (preferences.sentinel.enabled && isWithinWindow(parts, preferences.sentinel.time, graceMinutes)) {
    due.push({ kind: "sentinel", occurrenceKey: dayKey })
  }

  if (
    preferences.billsReminder.enabled &&
    isWithinWindow(parts, preferences.billsReminder.time, graceMinutes)
  ) {
    due.push({ kind: "billsReminder", occurrenceKey: dayKey })
  }

  if (
    preferences.openDatesReminder.enabled &&
    isWithinWindow(parts, preferences.openDatesReminder.time, graceMinutes)
  ) {
    due.push({ kind: "openDatesReminder", occurrenceKey: dayKey })
  }

  return due
}

/**
 * A data do calendário da pessoa vira o mesmo dia em UTC.
 *
 * Lançamento tem data de CALENDÁRIO (guardada à meia-noite UTC). Então "hoje"
 * para quem está em São Paulo é o dia 25 em UTC — e não o intervalo de 24 horas
 * que começa às 03:00 UTC. Converter por deslocamento de fuso traria o dia
 * errado nas pontas.
 */
export function utcDayRange(year: number, month: number, day: number) {
  return {
    from: new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0)),
    to: new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999)),
  }
}

/** Intervalo de N dias de calendário terminando no dia informado (inclusive). */
export function utcDaysBackRange(year: number, month: number, day: number, days: number) {
  const end = utcDayRange(year, month, day)
  const start = new Date(end.from.getTime() - (Math.max(1, days) - 1) * 24 * 60 * 60 * 1000)
  return { from: start, to: end.to }
}

/** Intervalo de N dias de calendário começando no dia informado (inclusive). */
export function utcDaysForwardRange(year: number, month: number, day: number, days: number) {
  const start = utcDayRange(year, month, day)
  const end = new Date(start.to.getTime() + (Math.max(1, days) - 1) * 24 * 60 * 60 * 1000)
  return { from: start.from, to: end }
}

/** O mês de calendário inteiro a que aquele dia pertence. */
export function utcMonthRange(year: number, month: number) {
  return {
    from: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)),
    to: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
  }
}

/** O mês fechado anterior, no formato "YYYYMM" que o resto do sistema usa. */
export function previousPeriod(year: number, month: number): string {
  const reference = new Date(Date.UTC(year, month - 2, 1))
  return `${reference.getUTCFullYear()}${pad(reference.getUTCMonth() + 1)}`
}
