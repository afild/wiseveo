/**
 * Fechamento de datas: regras puras (sem banco, sem React).
 * Chave de dia = "YYYY-MM-DD". Duas derivações que NUNCA se misturam:
 * - dayKeyOfStored: componentes UTC (lançamentos guardam meio-dia UTC, ver normalizeDate);
 * - dayKeyOfLocal: componentes locais (Dates que vieram da tela: useDateRange, seletor, hoje).
 */
export const DAY_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
export const PERIOD_RE = /^\d{4}(0[1-9]|1[0-2])$/

const pad = (n: number) => String(n).padStart(2, "0")

export function dayKeyOfStored(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

export function dayKeyOfLocal(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function isDayKey(value: unknown): value is string {
  if (typeof value !== "string" || !DAY_KEY_RE.test(value)) return false
  const [y, m, d] = value.split("-").map(Number)
  return dayKeyOfStored(new Date(Date.UTC(y, m - 1, d, 12))) === value
}

export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number)
  return dayKeyOfStored(new Date(Date.UTC(y, m - 1, d + days, 12)))
}

export function isDayClosed(day: string, closedThrough: string | null): boolean {
  return closedThrough !== null && day <= closedThrough
}

export function lastDayOfPeriod(period: string): string {
  const y = Number(period.slice(0, 4))
  const m = Number(period.slice(4, 6))
  return dayKeyOfStored(new Date(Date.UTC(y, m, 0, 12)))
}

export function isPeriodClosed(period: string, closedThrough: string | null): boolean {
  if (!PERIOD_RE.test(period)) return false
  return isDayClosed(lastDayOfPeriod(period), closedThrough)
}

export interface DateClosingPreferences {
  closedThrough: string | null
  pinHash: string | null
  pinUpdatedAt: string | null
  pinFailures: { count: number; lockedUntil: string | null }
}

export const defaultDateClosingPreferences: DateClosingPreferences = {
  closedThrough: null,
  pinHash: null,
  pinUpdatedAt: null,
  pinFailures: { count: 0, lockedUntil: null },
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function asIso(value: unknown): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null
}

/** Normaliza o JSON do banco: campo ausente ou fora da régua cai no padrão, nunca lança. */
export function resolveDateClosingPreferences(value: unknown): DateClosingPreferences {
  const r = asRecord(value)
  const failures = asRecord(r.pinFailures)
  const count = typeof failures.count === "number" && Number.isInteger(failures.count) && failures.count >= 0 ? failures.count : 0
  return {
    closedThrough: isDayKey(r.closedThrough) ? r.closedThrough : null,
    pinHash: typeof r.pinHash === "string" && r.pinHash.length > 0 ? r.pinHash : null,
    pinUpdatedAt: asIso(r.pinUpdatedAt),
    pinFailures: { count, lockedUntil: asIso(failures.lockedUntil) },
  }
}

export type SwitchLabel = "nothingToClose" | "open" | "closed" | "closedThrough"
export interface SwitchState {
  checked: boolean
  disabled: boolean
  label: SwitchLabel
  /** Dia até o qual "ligar" fecha; null quando ligar não é oferecido. */
  closeTarget: string | null
  /** Dia a partir do qual "desligar" reabre; null quando desligar não é oferecido. */
  reopenFrom: string | null
}

/** Tabela ordenada da seção 7 do desenho: a primeira linha que casar vale. */
export function computeSwitchState(input: { from: string; to: string; today: string; closedThrough: string | null }): SwitchState {
  const toStar = input.to < input.today ? input.to : input.today
  if (input.from > input.today) {
    return { checked: false, disabled: true, label: "nothingToClose", closeTarget: null, reopenFrom: null }
  }
  const c = input.closedThrough
  if (c === null) return { checked: false, disabled: false, label: "open", closeTarget: toStar, reopenFrom: null }
  if (toStar <= c) {
    return { checked: true, disabled: false, label: input.to > input.today ? "closedThrough" : "closed", closeTarget: null, reopenFrom: input.from }
  }
  if (input.from > c) return { checked: false, disabled: false, label: "open", closeTarget: toStar, reopenFrom: null }
  return { checked: false, disabled: false, label: "closedThrough", closeTarget: toStar, reopenFrom: null }
}
