import { addDays } from "date-fns"
import { endOfUTCDay, startOfUTCDay } from "@/lib/financial"
import type { AgentTranslator } from "@/features/ai/types/agent.types"

export const DEFAULT_TOOL_LIMIT = 5
export const MAX_TOOL_LIMIT = 20

export function toDateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`
}

export function startOfCurrentMonthUtc(reference = new Date()): Date {
  return new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1, 0, 0, 0, 0))
}

export function endOfCurrentMonthUtc(reference = new Date()): Date {
  return new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 0, 23, 59, 59, 999),
  )
}

export function parseToolDate(value: string | undefined, fallback: Date, boundary: "start" | "end") {
  if (!value) return fallback

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return fallback

  return boundary === "start" ? startOfUTCDay(parsed) : endOfUTCDay(parsed)
}

export function resolveToolRange(input: {
  from?: string
  to?: string
  defaultFrom?: Date
  defaultTo?: Date
}) {
  const defaultFrom = input.defaultFrom ?? startOfCurrentMonthUtc()
  const defaultTo = input.defaultTo ?? endOfCurrentMonthUtc()
  const from = parseToolDate(input.from, defaultFrom, "start")
  const to = parseToolDate(input.to, defaultTo, "end")

  if (from > to) {
    return { from: to, to: from }
  }

  return { from, to }
}

export function resolveUpcomingRange(input: { from?: string; to?: string; days?: number }) {
  const today = startOfUTCDay(new Date())
  const days = Math.max(1, Math.min(input.days ?? 45, 180))
  const fallbackTo = endOfUTCDay(addDays(today, days))

  return resolveToolRange({
    from: input.from,
    to: input.to,
    defaultFrom: today,
    defaultTo: fallbackTo,
  })
}

export function clampToolLimit(limit: number | undefined, fallback = DEFAULT_TOOL_LIMIT) {
  if (!limit || !Number.isFinite(limit)) return fallback
  return Math.max(1, Math.min(Math.trunc(limit), MAX_TOOL_LIMIT))
}

export function normalizeSearch(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

export function includesSearch(value: string | null | undefined, search: string | undefined): boolean {
  const normalizedSearch = normalizeSearch(search)
  if (!normalizedSearch) return true

  return normalizeSearch(value).includes(normalizedSearch)
}

export function pickTransactionTitle(
  input: {
    description?: string | null
    note?: string | null
    reference?: string | null
    payeeName?: string | null
    categoryName?: string | null
  },
  t: AgentTranslator,
): string {
  return (
    input.description?.trim() ||
    input.payeeName?.trim() ||
    input.note?.trim() ||
    input.reference?.trim() ||
    input.categoryName?.trim() ||
    t("toolUtils.untitledTransaction")
  )
}
