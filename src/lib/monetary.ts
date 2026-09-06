export type MonetaryCurrency = "BRL" | "USD" | "EUR"
export type MonetaryDisplayMode = "symbol" | "code" | "number"
export type MonetaryNegativeFormat = "parentheses" | "minus"

export interface MonetarySettings {
  currency: MonetaryCurrency
  displayMode: MonetaryDisplayMode
  negativeFormat: MonetaryNegativeFormat
}

export const defaultMonetarySettings: MonetarySettings = {
  currency: "BRL",
  displayMode: "number",
  negativeFormat: "parentheses",
}

/** Moeda com que todo usuário DEMO recém-provisionado nasce (acompanha o idioma en-US da demo). */
export const DEMO_DEFAULT_CURRENCY: MonetaryCurrency = "USD"

/** Preferências monetárias iniciais do usuário DEMO: só a moeda muda em relação ao padrão. */
export const demoMonetarySettings: MonetarySettings = {
  ...defaultMonetarySettings,
  currency: DEMO_DEFAULT_CURRENCY,
}

const localeByCurrency: Record<MonetaryCurrency, string> = {
  BRL: "pt-BR",
  USD: "en-US",
  EUR: "de-DE",
}

function normalizeNumericValue(value: number): number {
  return Number.isFinite(value) ? value : 0
}

function applyNegativeFormat(
  value: number,
  formatted: string,
  settings: MonetarySettings,
): string {
  if (value >= 0) return formatted
  if (settings.negativeFormat === "minus") return `-${formatted}`
  return `(${formatted})`
}

export function resolveMonetarySettings(
  settings?: Partial<MonetarySettings> | null,
): MonetarySettings {
  return {
    currency:
      settings?.currency === "USD" || settings?.currency === "EUR"
        ? settings.currency
        : defaultMonetarySettings.currency,
    displayMode:
      settings?.displayMode === "symbol" ||
      settings?.displayMode === "code" ||
      settings?.displayMode === "number"
        ? settings.displayMode
        : defaultMonetarySettings.displayMode,
    negativeFormat:
      settings?.negativeFormat === "minus"
        ? "minus"
        : defaultMonetarySettings.negativeFormat,
  }
}

export function getMonetaryLocale(settings?: Partial<MonetarySettings> | null): string {
  const resolved = resolveMonetarySettings(settings)
  return localeByCurrency[resolved.currency]
}

function buildDecimalFormatter(
  settings?: Partial<MonetarySettings> | null,
  options: Intl.NumberFormatOptions = {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  },
): Intl.NumberFormat {
  return new Intl.NumberFormat(getMonetaryLocale(settings), options)
}

function buildMonetaryFormatter(
  settings?: Partial<MonetarySettings> | null,
  options: Intl.NumberFormatOptions = {},
): Intl.NumberFormat {
  const resolved = resolveMonetarySettings(settings)

  if (resolved.displayMode === "number") {
    return buildDecimalFormatter(resolved, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      ...options,
    })
  }

  return new Intl.NumberFormat(getMonetaryLocale(resolved), {
    style: "currency",
    currency: resolved.currency,
    currencyDisplay: resolved.displayMode === "symbol" ? "symbol" : "code",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  })
}

export function formatMonetaryValue(
  value: number,
  settings?: Partial<MonetarySettings> | null,
): string {
  const safeValue = normalizeNumericValue(value)
  const resolved = resolveMonetarySettings(settings)
  const formatter = buildMonetaryFormatter(resolved)
  const absolute = formatter.format(Math.abs(safeValue))

  return applyNegativeFormat(safeValue, absolute, resolved)
}

export function formatAbsoluteMonetaryValue(
  value: number,
  settings?: Partial<MonetarySettings> | null,
): string {
  const safeValue = normalizeNumericValue(value)
  const formatter = buildMonetaryFormatter(settings)

  return formatter.format(Math.abs(safeValue))
}

export function formatNumberValue(
  value: number,
  options: Intl.NumberFormatOptions = {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  },
  settings?: Partial<MonetarySettings> | null,
): string {
  const safeValue = normalizeNumericValue(value)
  const resolved = resolveMonetarySettings(settings)
  const formatter = buildDecimalFormatter(resolved, options)

  return applyNegativeFormat(safeValue, formatter.format(Math.abs(safeValue)), resolved)
}

export function formatPercentValue(
  value: number,
  fractionDigits = 1,
  showPositiveSign = false,
): string {
  const safeValue = normalizeNumericValue(value)
  const formatted = `${Math.abs(safeValue).toFixed(fractionDigits)}%`

  if (safeValue < 0) return `(${formatted})`
  if (showPositiveSign && safeValue > 0) return `+${formatted}`
  return formatted
}

export function formatCompactValue(
  value: number,
  fractionDigits = 1,
  settings?: Partial<MonetarySettings> | null,
): string {
  const safeValue = normalizeNumericValue(value)
  if (safeValue === 0) return "0"

  const absoluteValue = Math.abs(safeValue)
  const decimalFormatter = buildDecimalFormatter(settings, {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  })
  const formatted =
    absoluteValue >= 1000
      ? `${decimalFormatter.format(absoluteValue / 1000)}k`
      : decimalFormatter.format(absoluteValue)

  return applyNegativeFormat(safeValue, formatted, resolveMonetarySettings(settings))
}

export function formatGenericValue(
  value: number,
  settings?: Partial<MonetarySettings> | null,
): string {
  const safeValue = normalizeNumericValue(value)
  return formatNumberValue(
    safeValue,
    {},
    settings,
  )
}

export function getMonetarySearchCandidates(
  value: number,
  settings?: Partial<MonetarySettings> | null,
): string[] {
  const safeValue = normalizeNumericValue(value)
  const resolved = resolveMonetarySettings(settings)
  const candidates = new Set<string>()
  const displayModes: MonetaryDisplayMode[] = ["number", "symbol", "code"]
  const negativeFormats: MonetaryNegativeFormat[] = ["parentheses", "minus"]

  for (const displayMode of displayModes) {
    for (const negativeFormat of negativeFormats) {
      const candidateSettings: MonetarySettings = {
        ...resolved,
        displayMode,
        negativeFormat,
      }

      candidates.add(formatMonetaryValue(safeValue, candidateSettings).toLowerCase())
      candidates.add(
        formatAbsoluteMonetaryValue(safeValue, candidateSettings).toLowerCase(),
      )
    }
  }

  candidates.add(formatMonetaryValue(safeValue, defaultMonetarySettings).toLowerCase())
  candidates.add(
    formatAbsoluteMonetaryValue(safeValue, defaultMonetarySettings).toLowerCase(),
  )
  candidates.add(formatNumberValue(safeValue, undefined, resolved).toLowerCase())
  candidates.add(
    formatNumberValue(Math.abs(safeValue), undefined, resolved).toLowerCase(),
  )
  candidates.add(safeValue.toString().toLowerCase())
  candidates.add(Math.abs(safeValue).toString().toLowerCase())

  return Array.from(candidates)
}

export function createMonetaryFormatter(settings?: Partial<MonetarySettings> | null) {
  const resolved = resolveMonetarySettings(settings)

  return {
    preferences: resolved,
    locale: getMonetaryLocale(resolved),
    formatMonetaryValue: (value: number) => formatMonetaryValue(value, resolved),
    formatAbsoluteMonetaryValue: (value: number) =>
      formatAbsoluteMonetaryValue(value, resolved),
    formatNumberValue: (
      value: number,
      options: Intl.NumberFormatOptions = {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
    ) => formatNumberValue(value, options, resolved),
    formatCompactValue: (value: number, fractionDigits = 1) =>
      formatCompactValue(value, fractionDigits, resolved),
    formatGenericValue: (value: number) => formatGenericValue(value, resolved),
    getSearchCandidates: (value: number) => getMonetarySearchCandidates(value, resolved),
  }
}

export type MonetaryFormatter = ReturnType<typeof createMonetaryFormatter>

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Caminho inverso de `formatNumberValue`: lê o que a pessoa digitou no formato da MOEDA
 * escolhida (pt-BR para BRL, en-US para USD, de-DE para EUR) e devolve número. Devolve `null`
 * para vazio e para o que não é número; quem decide se `null` é erro é o formulário.
 *
 * O separador de milhar só é descartado quando vem seguido de exatamente três dígitos. Sem essa
 * regra, um dono de BRL que digita "10.50" por hábito receberia 1050 em vez de 10,50.
 */
export function parseMonetaryInput(
  text: string,
  settings?: Partial<MonetarySettings> | null,
): number | null {
  if (typeof text !== "string") return null
  const trimmed = text.trim()
  if (trimmed === "") return null

  const parts = new Intl.NumberFormat(getMonetaryLocale(settings)).formatToParts(12345.6)
  const group = parts.find((part) => part.type === "group")?.value ?? ","
  const decimal = parts.find((part) => part.type === "decimal")?.value ?? "."

  // Espaço comum, rígido e fino aparecem como separador de milhar em alguns locales.
  let cleaned = trimmed.replace(/[\s\u00A0\u202F]/g, "")

  cleaned = cleaned.replace(new RegExp(`${escapeRegExp(group)}(?=\\d{3}(?!\\d))`, "g"), "")
  // O que sobrou do caractere de milhar era, na verdade, o decimal.
  cleaned = cleaned.split(group).join(decimal)
  cleaned = cleaned.split(decimal).join(".")

  if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(cleaned)) return null

  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}
