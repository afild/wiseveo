/**
 * Fechamento de datas: regras puras (sem banco, sem React).
 * Chave de dia = "YYYY-MM-DD". Duas derivações que NUNCA se misturam:
 * - dayKeyOfStored: componentes UTC (lançamentos guardam meio-dia UTC, ver normalizeDate);
 * - dayKeyOfLocal: componentes locais (Dates que vieram da tela: useDateRange, seletor, hoje).
 */
import { isValidPeriod } from "@/lib/financial"

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

/**
 * Forma mínima de uma data vinda do corpo da requisição: "YYYY-M-D", com hora opcional depois de
 * um "T" ou de um espaço. Barra o que nem parece data ("202609", "31/08/2026") antes do `Date`.
 */
const DAY_INPUT_RE = /^\d{4}-\d{1,2}-\d{1,2}(?:[T\s].*)?$/

/**
 * Entrada de rota para chave de dia, ou null quando é ilegível (a rota responde 400). Uma chave
 * "YYYY-MM-DD" passa intacta; um instante ISO completo é reduzido ao dia UTC, exatamente o dia que
 * `normalizeDate` gravaria. Sem isto, texto ilegível chegava como "NaN-NaN-NaN" e morria em 500.
 */
export function toDayKeyInput(value: unknown): string | null {
  if (typeof value !== "string") return null
  const raw = value.trim()
  if (isDayKey(raw)) return raw
  if (!DAY_INPUT_RE.test(raw)) return null
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  const key = dayKeyOfStored(parsed)
  return isDayKey(key) ? key : null
}

/**
 * Competência LIDA DO BANCO (coluna `char(6)`, com anos de histórico), ou null quando não é
 * exatamente "YYYYMM". Padding de espaço, vazio e lixo antigo viram null, que a trava ignora sem
 * lançar: sem isto, uma linha velha derrubaria uma edição comum com 500. O DIA da própria linha
 * continua conferido, que é a proteção de verdade. Vale só para o que já está gravado; competência
 * vinda da requisição segue barrada com 400 na rota (`toPeriodInput`).
 * O piso de ano é o mesmo do `toPeriodInput` (1900), e pela mesma razão: `Date.UTC` joga os anos
 * 0-99 para os anos 1900, então um "000112" gravado viraria 31/01/1900 em `lastDayOfPeriod`,
 * anterior a qualquer corte real, e uma edição comum voltaria com "data fechada" (423). Ano
 * absurdo é lixo antigo como qualquer outro: vira null e a trava pula a competência.
 */
export function storedPeriod(value: string | null | undefined): string | null {
  const raw = typeof value === "string" ? value.trim() : ""
  return isValidPeriod(raw) ? raw : null
}

/**
 * Entrada de rota para competência, ou null quando não é exatamente "YYYYMM" (a rota responde 400).
 * O piso de ano é o mesmo do `isValidPeriod` (1900), e não é enfeite: `Date.UTC` joga os anos 0-99
 * para os anos 1900, então "000012" viraria 31/12/1900 em `lastDayOfPeriod` — anterior a qualquer
 * corte real — e a rota recusaria com "data fechada" (423) uma competência que é só inválida (400).
 */
export function toPeriodInput(value: unknown): string | null {
  const raw =
    typeof value === "string" ? value.trim() : typeof value === "number" && Number.isInteger(value) ? String(value) : null
  return raw !== null && isValidPeriod(raw) ? raw : null
}

export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number)
  return dayKeyOfStored(new Date(Date.UTC(y, m - 1, d + days, 12)))
}

export function isDayClosed(day: string, closedThrough: string | null): boolean {
  return closedThrough !== null && day <= closedThrough
}

/**
 * Piso do campo de data das telas de fechamento. Abaixo de 1900 o `Date.UTC` joga os anos 0-99
 * para os anos 1900, então "0026-09-01" nem passa por `isDayKey` e a rota devolve 400: o seletor
 * não deve nem oferecer o que o servidor vai recusar. Mesmo piso do `isValidPeriod`.
 */
export const MIN_DAY_KEY = "1900-01-01"

/**
 * A linha está dentro do período fechado? É a decisão do cadeado da tabela e do cartão, e mora
 * aqui (pura) porque nenhum componente é testável neste projeto: o vitest é só Node.
 *
 * A data da linha vem do banco gravada ao meio-dia UTC (`normalizeDate`), então o dia sai dos
 * componentes UTC. Derivar pelo dia LOCAL escorrega para o dia vizinho em qualquer linha que não
 * esteja exatamente ao meio-dia (histórico antigo gravado à meia-noite), e o cadeado cai na
 * linha errada.
 */
export function lockedForRow(storedDate: Date | string, closedThrough: string | null): boolean {
  const parsed = storedDate instanceof Date ? storedDate : new Date(storedDate)
  if (Number.isNaN(parsed.getTime())) return false
  return isDayClosed(dayKeyOfStored(parsed), closedThrough)
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
