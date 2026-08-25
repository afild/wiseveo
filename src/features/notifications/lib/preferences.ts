/**
 * O que cada pessoa escolheu receber — e a que horas, no fuso dela.
 *
 * Mora em `User.preferencesJson.notifications` (nenhuma coluna nova em `users`:
 * a lição do `data_owner_id` vale aqui também). Módulo PURO: normaliza o que
 * veio do banco ou da tela e devolve sempre um objeto completo, para que
 * nenhuma parte do relógio precise checar campo por campo.
 *
 * Tudo nasce DESLIGADO. Ninguém deve começar a receber mensagem no Telegram por
 * causa de uma atualização do sistema — só depois de pedir, na tela.
 */

export const NOTIFICATION_KINDS = [
  "dailyDigest",
  "weeklyDigest",
  "monthlyDigest",
  "sentinel",
  "billsReminder",
] as const

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

/** "HH:MM" em relógio de 24 horas — o que a tela guarda e o relógio compara. */
export type TimeOfDay = string

export interface NotificationPreferences {
  /** Identificador IANA (ex.: "America/Sao_Paulo"). "UTC" quando desconhecido. */
  timezone: string
  dailyDigest: { enabled: boolean; time: TimeOfDay }
  /** `weekday`: 0 = domingo … 6 = sábado (mesma numeração de `Date.getUTCDay`). */
  weeklyDigest: { enabled: boolean; time: TimeOfDay; weekday: number }
  /** `day`: 1 a 28 — o teto evita o mês que não tem dia 29, 30 ou 31. */
  monthlyDigest: { enabled: boolean; time: TimeOfDay; day: number }
  sentinel: { enabled: boolean; time: TimeOfDay }
  /** `daysAhead`: quantos dias à frente o lembrete olha (1 = só amanhã). */
  billsReminder: { enabled: boolean; time: TimeOfDay; daysAhead: number }
}

export const MIN_BILLS_DAYS_AHEAD = 1
export const MAX_BILLS_DAYS_AHEAD = 14
export const MAX_MONTHLY_DAY = 28

export const defaultNotificationPreferences: NotificationPreferences = {
  timezone: "UTC",
  dailyDigest: { enabled: false, time: "08:00" },
  weeklyDigest: { enabled: false, time: "08:00", weekday: 1 },
  monthlyDigest: { enabled: false, time: "08:00", day: 1 },
  sentinel: { enabled: false, time: "20:00" },
  billsReminder: { enabled: false, time: "08:00", daysAhead: 1 },
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isValidTimeOfDay(value: unknown): value is TimeOfDay {
  return typeof value === "string" && TIME_RE.test(value)
}

/**
 * Fuso válido é o que o próprio motor de datas aceita. Sem locale fixo: o que
 * está sendo verificado é o IDENTIFICADOR do fuso, não o idioma de exibição.
 */
export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value })
    return true
  } catch {
    return false
  }
}

/** Minutos desde a meia-noite. Entrada inválida vira o padrão do próprio campo. */
export function timeToMinutes(time: TimeOfDay): number {
  const [hour, minute] = time.split(":")
  return Number(hour) * 60 + Number(minute)
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback
}

function pickTime(value: unknown, fallback: TimeOfDay): TimeOfDay {
  return isValidTimeOfDay(value) ? value : fallback
}

function pickInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  const rounded = Math.trunc(parsed)
  if (rounded < min || rounded > max) return fallback
  return rounded
}

/**
 * Normaliza qualquer coisa (JSON do banco, corpo de requisição) em preferências
 * completas. Campo ausente ou fora da régua cai no padrão — nunca lança.
 */
export function resolveNotificationPreferences(value: unknown): NotificationPreferences {
  const record = asRecord(value)
  const daily = asRecord(record.dailyDigest)
  const weekly = asRecord(record.weeklyDigest)
  const monthly = asRecord(record.monthlyDigest)
  const sentinel = asRecord(record.sentinel)
  const bills = asRecord(record.billsReminder)
  const defaults = defaultNotificationPreferences

  return {
    timezone: isValidTimeZone(record.timezone) ? (record.timezone as string) : defaults.timezone,
    dailyDigest: {
      enabled: pickBoolean(daily.enabled, defaults.dailyDigest.enabled),
      time: pickTime(daily.time, defaults.dailyDigest.time),
    },
    weeklyDigest: {
      enabled: pickBoolean(weekly.enabled, defaults.weeklyDigest.enabled),
      time: pickTime(weekly.time, defaults.weeklyDigest.time),
      weekday: pickInteger(weekly.weekday, defaults.weeklyDigest.weekday, 0, 6),
    },
    monthlyDigest: {
      enabled: pickBoolean(monthly.enabled, defaults.monthlyDigest.enabled),
      time: pickTime(monthly.time, defaults.monthlyDigest.time),
      day: pickInteger(monthly.day, defaults.monthlyDigest.day, 1, MAX_MONTHLY_DAY),
    },
    sentinel: {
      enabled: pickBoolean(sentinel.enabled, defaults.sentinel.enabled),
      time: pickTime(sentinel.time, defaults.sentinel.time),
    },
    billsReminder: {
      enabled: pickBoolean(bills.enabled, defaults.billsReminder.enabled),
      time: pickTime(bills.time, defaults.billsReminder.time),
      daysAhead: pickInteger(
        bills.daysAhead,
        defaults.billsReminder.daysAhead,
        MIN_BILLS_DAYS_AHEAD,
        MAX_BILLS_DAYS_AHEAD,
      ),
    },
  }
}

/** Alguma coisa ligada? Se não, o relógio nem olha para esta pessoa. */
export function hasAnyNotificationEnabled(preferences: NotificationPreferences): boolean {
  return (
    preferences.dailyDigest.enabled ||
    preferences.weeklyDigest.enabled ||
    preferences.monthlyDigest.enabled ||
    preferences.sentinel.enabled ||
    preferences.billsReminder.enabled
  )
}
