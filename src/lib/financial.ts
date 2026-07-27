/**
 * Shared financial utilities.
 *
 * These helpers are intentionally framework-agnostic so they can be used in
 * server components, API routes, and client code alike.
 */

/**
 * Normalises a date to 12:00:00 UTC.
 *
 * Storing dates at noon UTC prevents the common timezone-shift bug where a
 * transaction entered at e.g. 23:00 BRT (UTC-3) would otherwise roll to the
 * next calendar day when the JS Date constructor interprets it as 02:00 UTC.
 */
export function normalizeDate(date: Date | string): Date {
  const d = new Date(date)
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0),
  )
}

/**
 * Returns a Date object representing the very start of the day (00:00:00.000) in UTC.
 */
export function startOfUTCDay(date: Date | string): Date {
  const d = new Date(date)
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  )
}

/**
 * Returns a Date object representing the very end of the day (23:59:59.999) in UTC.
 */
export function endOfUTCDay(date: Date | string): Date {
  const d = new Date(date)
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  )
}

/**
 * Safely coerces a balance value to a finite number.
 *
 * `null`, `undefined`, `NaN` and `Infinity` all become `0`, preventing
 * corrupted balances from propagating through every downstream calculation.
 */
export function safeBalance(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0
  return value
}

/**
 * Returns the competence period (YYYYMM) as a 6-character string.
 *
 * Used for classification/filtering of transactions by competence month,
 * independently of payment date. When no date is provided, uses the
 * current date. Month is zero-padded.
 */
export function periodFromDate(date?: Date | string | null): string {
  if (typeof date === "string") {
    const raw = date.trim()

    // Allow passing a period directly ("YYYYMM").
    if (/^\d{4}(0[1-9]|1[0-2])$/.test(raw)) return raw

    // Avoid timezone shifts for date-only strings like "2026-04-01" which are
    // interpreted as UTC by the JS Date constructor.
    const match = /^(\d{4})-(\d{2})/.exec(raw)
    if (match && /^(0[1-9]|1[0-2])$/.test(match[2])) {
      return `${match[1]}${match[2]}`
    }
  }

  const fromNow = () => {
    // Sem data explícita, "período atual" é o mês do calendário do usuário — local.
    const now = new Date()
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`
  }

  if (!date) return fromNow()

  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return fromNow()

  // Data explícita: componentes UTC. Todas as datas do sistema são gravadas ao
  // meio-dia UTC (`normalizeDate`) e as fronteiras de intervalo vêm de
  // `startOfUTCDay`/`endOfUTCDay` — ler em horário LOCAL jogava 01/07 00:00 UTC
  // para 30/06 em UTC-3, e filtros por período pegavam um mês a mais.
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

/**
 * Validates a period string in the YYYYMM format (year >= 1900, month 01-12).
 */
export function isValidPeriod(period: string): boolean {
  return /^\d{4}(0[1-9]|1[0-2])$/.test(period) && Number(period.slice(0, 4)) >= 1900
}

/**
 * Parses a YYYYMM period string into { year, month } (month is 1-12).
 */
export function parsePeriod(period: string): { year: number; month: number } {
  return {
    year: Number(period.slice(0, 4)),
    month: Number(period.slice(4, 6)),
  }
}

/**
 * Formats a YYYYMM period as "MM/YYYY" for UI display.
 */
export function formatPeriod(period: string): string {
  return `${period.slice(4, 6)}/${period.slice(0, 4)}`
}
