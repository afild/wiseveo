import { getTransactions } from "@/features/transactions/services/get-transactions"
import type { SerializedTransaction } from "@/features/transactions/types"
import { endOfUTCDay, startOfUTCDay } from "@/lib/financial"
import type { MonetaryFormatter } from "@/lib/monetary"
import { createDateFormatter } from "@/i18n/format"
import {
  clampToolLimit,
  includesSearch,
  normalizeSearch,
  startOfCurrentMonthUtc,
  endOfCurrentMonthUtc,
} from "@/features/ai/tools/tool-utils"
import type { TelegramToolContext } from "../types/telegram.types"

type TransactionType = "INCOME" | "EXPENSE" | "TRANSFER"
type TransactionStatus = "PAID" | "PENDING" | "OVERDUE" | "SCHEDULED"

export interface TransactionSearchInput {
  userId: string
  period?: { from: string; to: string }
  searchText?: string
  transactionType?: TransactionType
  status?: TransactionStatus
  accountName?: string
  groupName?: string
  categoryName?: string
  limit?: number
}

export interface TransactionSearchItem {
  id: string
  period: string
  date: string
  formattedDate: string
  reference: string | null
  note: string | null
  description: string | null
  groupName: string
  categoryName: string
  formattedAmount: string
  accountName: string
  status: TransactionStatus
  statusLabel: string
  matchedColumns: string[]
}

export interface TransactionSearchResult {
  period: { from: string; to: string; label: string }
  filters: {
    searchText?: string
    transactionType?: TransactionType
    status?: TransactionStatus
    accountName?: string
    groupName?: string
    categoryName?: string
  }
  totalCount: number
  shownCount: number
  total: number
  formattedTotal: string
  items: TransactionSearchItem[]
  aggregates: {
    byCategory: Array<{ name: string; count: number; total: number; formattedTotal: string }>
    byAccount: Array<{ name: string; count: number; total: number; formattedTotal: string }>
    byStatus: Array<{ name: string; count: number; total: number; formattedTotal: string }>
  }
  noMatchesMessage?: string
}

function buildStatusLabels(t: TelegramToolContext["t"]): Record<TransactionStatus, string> {
  return {
    PAID: t("transactionSearch.statusPaid"),
    PENDING: t("transactionSearch.statusPending"),
    OVERDUE: t("transactionSearch.statusOverdue"),
    SCHEDULED: t("transactionSearch.statusScheduled"),
  }
}

function resolveRange(period: TransactionSearchInput["period"]) {
  const from = period?.from ? startOfUTCDay(new Date(period.from)) : startOfCurrentMonthUtc()
  const to = period?.to ? endOfUTCDay(new Date(period.to)) : endOfCurrentMonthUtc()
  return from > to ? { from: to, to: from } : { from, to }
}

function formatDate(value: string, ctx: TelegramToolContext) {
  return createDateFormatter(ctx.locale, { timeZone: "UTC" }).format(new Date(value))
}

function formatPeriodLabel(from: Date, to: Date, ctx: TelegramToolContext) {
  const sameMonth =
    from.getUTCFullYear() === to.getUTCFullYear() && from.getUTCMonth() === to.getUTCMonth()

  if (sameMonth) {
    const month = createDateFormatter(ctx.locale, {
      month: "long",
      timeZone: "UTC",
    }).format(from)
    return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${from.getUTCFullYear()}`
  }

  return `${formatDate(from.toISOString(), ctx)} ${ctx.t("transactionSearch.periodRangeJoiner")} ${formatDate(to.toISOString(), ctx)}`
}

// Internal search-match bookkeeping tags: they identify which field matched a
// free-text search term (see matchedColumns below) but are never serialized
// into card output or fed to the LLM prompt (formatTransactionSearchCard only
// reads label/value/detail/tone from items) — lookup keys, not UI copy.
function searchableColumns(
  transaction: SerializedTransaction,
  ctx: TelegramToolContext,
  statusLabels: Record<TransactionStatus, string>,
) {
  const formattedDate = formatDate(transaction.date, ctx)
  const formattedAmount = ctx.monetary.formatNumberValue(transaction.amount)
  const statusLabel = statusLabels[transaction.status]

  return [
    { name: "PERÍODO", value: transaction.period }, // i18n-ignore
    { name: "DATA", value: transaction.date.slice(0, 10) },
    { name: "DATA", value: formattedDate },
    { name: "REF", value: transaction.reference },
    { name: "HISTÓRICO", value: transaction.note }, // i18n-ignore
    { name: "DESCRIÇÃO", value: transaction.description }, // i18n-ignore
    { name: "GRUPO", value: transaction.category.group.name },
    { name: "CATEGORIA", value: transaction.category.name },
    { name: "VALOR", value: formattedAmount },
    { name: "VALOR", value: String(transaction.amount) },
    { name: "BANCO", value: transaction.account.name },
    { name: "STATUS", value: transaction.status },
    { name: "STATUS", value: statusLabel },
  ]
}

function normalizeLightLiteralSearch(value: string | null | undefined): string {
  return normalizeSearch(value)
    .replace(/([a-z])\1+/g, "$1")
    .replace(/\s+/g, " ")
}

export function includesLiteralSearch(value: string | null | undefined, search: string | undefined): boolean {
  const normalizedSearch = normalizeSearch(search)
  if (!normalizedSearch) return true
  if (includesSearch(value, search)) return true

  const lightSearch = normalizeLightLiteralSearch(search)
  return Boolean(lightSearch) && normalizeLightLiteralSearch(value).includes(lightSearch)
}

function matchesLiteralSearch(
  transaction: SerializedTransaction,
  searchText: string | undefined,
  ctx: TelegramToolContext,
  statusLabels: Record<TransactionStatus, string>,
) {
  const term = searchText?.trim()
  if (!term) return true
  return searchableColumns(transaction, ctx, statusLabels).some((column) => includesLiteralSearch(column.value, term))
}

function matchedColumns(
  transaction: SerializedTransaction,
  searchText: string | undefined,
  ctx: TelegramToolContext,
  statusLabels: Record<TransactionStatus, string>,
) {
  const term = searchText?.trim()
  if (!term) return []

  return Array.from(
    new Set(
      searchableColumns(transaction, ctx, statusLabels)
        .filter((column) => includesLiteralSearch(column.value, term))
        .map((column) => column.name),
    ),
  )
}

function buildAggregate(
  transactions: SerializedTransaction[],
  getName: (transaction: SerializedTransaction) => string,
  monetary: MonetaryFormatter,
) {
  const groups = new Map<string, { count: number; total: number }>()

  for (const transaction of transactions) {
    const name = getName(transaction)
    const existing = groups.get(name) ?? { count: 0, total: 0 }
    groups.set(name, {
      count: existing.count + 1,
      total: existing.total + transaction.amount,
    })
  }

  return Array.from(groups.entries())
    .sort((a, b) => Math.abs(b[1].total) - Math.abs(a[1].total))
    .slice(0, 5)
    .map(([name, value]) => ({
      name,
      count: value.count,
      total: value.total,
      formattedTotal: monetary.formatNumberValue(value.total),
    }))
}

function buildNoMatchesMessage(
  input: {
    searchText?: string
    periodLabel: string
    hasStructuredFilters: boolean
  },
  t: TelegramToolContext["t"],
) {
  const term = input.searchText?.trim()
  if (term) {
    return t("transactionSearch.noMatchesWithTerm", { term, period: input.periodLabel })
  }

  if (input.hasStructuredFilters) {
    return t("transactionSearch.noMatchesWithFilters", { period: input.periodLabel })
  }

  return t("transactionSearch.noMatches", { period: input.periodLabel })
}

export async function searchTransactions(
  input: TransactionSearchInput,
  ctx: TelegramToolContext,
): Promise<TransactionSearchResult> {
  const { from, to } = resolveRange(input.period)
  const { transactions } = await getTransactions({ userId: input.userId, from, to })
  const take = clampToolLimit(input.limit, 10)
  const statusLabels = buildStatusLabels(ctx.t)

  const allFiltered = transactions
    .filter((transaction) => !input.transactionType || transaction.type === input.transactionType)
    .filter((transaction) => !input.status || transaction.status === input.status)
    .filter((transaction) => includesSearch(transaction.account.name, input.accountName))
    .filter((transaction) => includesSearch(transaction.category.group.name, input.groupName))
    .filter((transaction) => includesSearch(transaction.category.name, input.categoryName))
    .filter((transaction) => matchesLiteralSearch(transaction, input.searchText, ctx, statusLabels))

  const total = allFiltered.reduce((sum, transaction) => sum + transaction.amount, 0)
  const items = allFiltered.slice(0, take)
  const periodLabel = formatPeriodLabel(from, to, ctx)
  const hasStructuredFilters = Boolean(
    input.transactionType || input.status || input.accountName || input.groupName || input.categoryName,
  )

  return {
    period: {
      from: from.toISOString(),
      to: to.toISOString(),
      label: periodLabel,
    },
    filters: {
      searchText: input.searchText?.trim() || undefined,
      transactionType: input.transactionType,
      status: input.status,
      accountName: input.accountName,
      groupName: input.groupName,
      categoryName: input.categoryName,
    },
    totalCount: allFiltered.length,
    shownCount: items.length,
    total,
    formattedTotal: ctx.monetary.formatNumberValue(total),
    items: items.map((transaction) => ({
      id: transaction.id,
      period: transaction.period,
      date: transaction.date,
      formattedDate: formatDate(transaction.date, ctx),
      reference: transaction.reference,
      note: transaction.note,
      description: transaction.description,
      groupName: transaction.category.group.name,
      categoryName: transaction.category.name,
      formattedAmount: ctx.monetary.formatNumberValue(transaction.amount),
      accountName: transaction.account.name,
      status: transaction.status,
      statusLabel: statusLabels[transaction.status],
      matchedColumns: matchedColumns(transaction, input.searchText, ctx, statusLabels),
    })),
    aggregates: {
      byCategory: buildAggregate(allFiltered, (transaction) => transaction.category.name, ctx.monetary),
      byAccount: buildAggregate(allFiltered, (transaction) => transaction.account.name, ctx.monetary),
      byStatus: buildAggregate(allFiltered, (transaction) => statusLabels[transaction.status], ctx.monetary),
    },
    noMatchesMessage:
      allFiltered.length === 0
        ? buildNoMatchesMessage(
            {
              searchText: input.searchText,
              periodLabel,
              hasStructuredFilters,
            },
            ctx.t,
          )
        : undefined,
  }
}
