import { getTransactions } from "@/features/transactions/services/get-transactions"
import {
  endOfCurrentMonthUtc,
} from "@/features/ai/tools/tool-utils"
import { startOfUTCDay, endOfUTCDay } from "@/lib/financial"
import type { ClassifiedQuery } from "./query-classifier.service"
import { searchTransactions, includesLiteralSearch } from "./transaction-search.service"
import { executeTelegramTool } from "./tool-executor.service"
import type { TelegramToolContext } from "../types/telegram.types"

export interface DispatchResult {
  intent: string
  data: unknown
}

async function resolveRange(userId: string, classified: ClassifiedQuery) {
  // Se houver período explícito, usa ele
  if (classified.period?.from) {
    const from = startOfUTCDay(new Date(classified.period.from))
    const to = classified.period?.to
      ? endOfUTCDay(new Date(classified.period.to))
      : endOfCurrentMonthUtc()
    return { from, to }
  }

  // Comportamento padrão: de 12 meses atrás até o fim do ano atual
  // Isso cobre histórico para análise e agendamentos futuros para planejamento
  const now = new Date()
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1, 0, 0, 0, 0))
  const to = new Date(Date.UTC(now.getUTCFullYear(), 11, 31, 23, 59, 59, 999))

  return { from, to }
}

async function groupByPayee(
  userId: string,
  classified: ClassifiedQuery,
  ctx: TelegramToolContext,
): Promise<DispatchResult> {
  const { from, to } = await resolveRange(userId, classified)
  const { transactions } = await getTransactions({ userId, from, to })

  const filtered = transactions.filter((t) => {
    // 1. Filtro de Texto (Busca livre em vários campos)
    if (classified.searchText) {
      const q = classified.searchText
      const matchesSearch = 
        includesLiteralSearch(t.category.name, q) ||
        includesLiteralSearch(t.category.group.name, q) ||
        includesLiteralSearch(t.payee?.name, q) ||
        includesLiteralSearch(t.description, q) ||
        includesLiteralSearch(t.note, q) ||
        includesLiteralSearch(t.reference, q)
      if (!matchesSearch) return false
    }

    // 2. Filtro de Categoria (Se o LLM detectou uma categoria específica)
    if (classified.categoryName) {
      const catMatch = includesLiteralSearch(t.category.name, classified.categoryName)
      // Se houver texto de busca E categoria, permitimos que um OU outro bata (mais tolerante)
      // pois às vezes o LLM separa o que deveria estar junto.
      if (!catMatch && !classified.searchText) return false
    }

    // 3. Filtro de Grupo
    if (classified.groupName && !includesLiteralSearch(t.category.group.name, classified.groupName)) return false

    // 4. Filtro de Tipo (INCOME/EXPENSE)
    if (classified.transactionType) {
      const typeMatch = t.type.toUpperCase() === classified.transactionType.toUpperCase()
      // Se houver busca por texto livre, somos tolerantes ao erro de classificação de tipo
      if (!typeMatch && !classified.searchText) return false
    }

    return true
  })

  const groups = new Map<string, { total: number; count: number }>()
  for (const t of filtered) {
    const key = t.payee?.name?.trim() || t.description?.trim() || t.category.name
    const existing = groups.get(key) ?? { total: 0, count: 0 }
    groups.set(key, { total: existing.total + t.amount, count: existing.count + 1 })
  }

  const limit = classified.limit ?? 5
  const items = Array.from(groups.entries())
    .sort((a, b) => Math.abs(b[1].total) - Math.abs(a[1].total))
    .slice(0, limit)
    .map(([name, { total, count }]) => ({
      name,
      total,
      count,
      formattedTotal: ctx.monetary.formatNumberValue(total),
    }))

  const grandTotal = filtered.reduce((sum, t) => sum + t.amount, 0)

  return {
    intent: "spending_by_payee",
    data: {
      period: { from: from.toISOString(), to: to.toISOString() },
      filter:
        [classified.categoryName, classified.groupName, classified.searchText].filter(Boolean).join(" + ") ||
        ctx.t("cardFormatter.generalFilter"),
      totalTransactions: filtered.length,
      totalGroups: groups.size,
      shownGroups: items.length,
      grandTotal,
      formattedGrandTotal: ctx.monetary.formatNumberValue(grandTotal),
      items,
    },
  }
}

export async function dispatchQuery(
  userId: string,
  classified: ClassifiedQuery,
  ctx: TelegramToolContext,
): Promise<DispatchResult> {
  console.log("[Dispatcher] Intent:", classified.intent, "Filters:", {
    cat: classified.categoryName,
    search: classified.searchText,
    type: classified.transactionType
  })

  switch (classified.intent) {
    case "transaction_search":
      return {
        intent: "transaction_search",
        data: await searchTransactions(
          {
            userId,
            period: classified.period,
            searchText: classified.searchText,
            transactionType: classified.transactionType,
            categoryName: classified.categoryName,
            groupName: classified.groupName,
            limit: classified.limit,
          },
          ctx,
        ),
      }

    case "spending_by_payee":
      return groupByPayee(userId, classified, ctx)

    // "financial_analysis" não chega mais aqui: o agente atende esse caso com as
    // próprias ferramentas, antes do despacho (message-handler.service.ts).

    case "upcoming":
      return {
        intent: "upcoming",
        data: await executeTelegramTool(userId, "get_upcoming_transactions", {
          days: classified.limit ?? 30,
        }, ctx),
      }

    case "account_balance":
      return {
        intent: "account_balance",
        data: await executeTelegramTool(userId, "get_account_balances", {}, ctx),
      }

    case "financial_summary":
      return {
        intent: "financial_summary",
        data: await executeTelegramTool(userId, "get_financial_summary", {
          from: classified.period?.from,
          to: classified.period?.to,
        }, ctx),
      }

    case "transaction_list":
      return {
        intent: "transaction_list",
        data: await executeTelegramTool(userId, "get_transactions", {
          from: classified.period?.from,
          to: classified.period?.to,
          type: classified.transactionType,
          status: classified.status,
          accountName: classified.accountName,
          categoryName: classified.categoryName,
          groupName: classified.groupName,
          search: classified.searchText,
          limit: classified.limit,
        }, ctx),
      }

    case "dre":
      return {
        intent: "dre",
        data: await executeTelegramTool(userId, "get_dre", {
          from: classified.period?.from,
          to: classified.period?.to,
          limit: classified.limit,
        }, ctx),
      }

    case "budget":
      return {
        intent: "budget",
        data: await executeTelegramTool(userId, "get_budget", {
          referenceDate: classified.period?.from ?? classified.date,
          limit: classified.limit,
        }, ctx),
      }

    case "calendar_day":
      return {
        intent: "calendar_day",
        data: await executeTelegramTool(userId, "get_calendar_day", {
          date: classified.date ?? classified.period?.from ?? new Date().toISOString().slice(0, 10),
          limit: classified.limit,
        }, ctx),
      }

    case "recurring":
      return {
        intent: "recurring",
        data: await executeTelegramTool(userId, "get_recurring_transactions", {
          type: classified.transactionType,
          accountName: classified.accountName,
          categoryName: classified.categoryName,
          groupName: classified.groupName,
          search: classified.searchText,
          limit: classified.limit,
        }, ctx),
      }

    default:
      return {
        intent: "unknown",
        data: { message: ctx.t("toolDispatcher.unknownFallback") },
      }
  }
}
