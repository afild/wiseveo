import { tool } from "ai"
import { z } from "zod"
import { getTransactions } from "@/features/transactions/services/get-transactions"
import {
  clampToolLimit,
  includesSearch,
  pickTransactionTitle,
  resolveToolRange,
} from "./tool-utils"
import type { AgentToolContext } from "@/features/ai/types/agent.types"

const transactionTypeSchema = z.enum(["INCOME", "EXPENSE", "TRANSFER"])
const transactionStatusSchema = z.enum(["PAID", "PENDING", "OVERDUE", "SCHEDULED"])

export function createTransactionsTool(userId: string, ctx: AgentToolContext) {
  return tool({
    // Tool metadata below (description/describe) is an LLM function-calling
    // definition, not UI copy — kept in Portuguese and i18n-ignored throughout.
    description:
      "Busca lancamentos financeiros por periodo e filtros de tipo, status, banco, grupo, categoria ou texto livre.", // i18n-ignore
    inputSchema: z.object({
      from: z.string().optional().describe("Data inicial no formato YYYY-MM-DD. Padrao: inicio do mes atual."), // i18n-ignore
      to: z.string().optional().describe("Data final no formato YYYY-MM-DD. Padrao: fim do mes atual."), // i18n-ignore
      type: transactionTypeSchema.optional().describe("Tipo do lancamento."), // i18n-ignore
      status: transactionStatusSchema.optional().describe("Status normalizado do lancamento."), // i18n-ignore
      accountName: z.string().optional().describe("Nome parcial do banco/conta."), // i18n-ignore
      categoryName: z.string().optional().describe("Nome parcial da categoria."), // i18n-ignore
      groupName: z.string().optional().describe("Nome parcial do grupo."), // i18n-ignore
      search: z.string().optional().describe("Texto livre para buscar em historico, descricao, referencia ou favorecido."), // i18n-ignore
      limit: z.number().int().positive().max(20).optional().describe("Quantidade maxima de itens."), // i18n-ignore
    }),
    execute: async (input) => {
      const range = resolveToolRange({ from: input.from, to: input.to })
      const take = clampToolLimit(input.limit, 10)
      const { transactions } = await getTransactions({ userId, from: range.from, to: range.to })

      const allFiltered = transactions
        .filter((transaction) => !input.type || transaction.type === input.type)
        .filter((transaction) => !input.status || transaction.status === input.status)
        .filter((transaction) => includesSearch(transaction.account.name, input.accountName))
        .filter((transaction) => includesSearch(transaction.category.name, input.categoryName))
        .filter((transaction) => includesSearch(transaction.category.group.name, input.groupName))
        .filter((transaction) => {
          if (!input.search) return true

          return [
            transaction.description,
            transaction.note,
            transaction.reference,
            transaction.payee?.name,
            transaction.category.name,
            transaction.category.group.name,
            transaction.account.name,
          ].some((value) => includesSearch(value, input.search))
        })

      // Total computed from ALL matching transactions before slicing for display
      const total = allFiltered.reduce((sum, transaction) => sum + transaction.amount, 0)
      const items = allFiltered.slice(0, take)

      return {
        period: {
          from: range.from.toISOString(),
          to: range.to.toISOString(),
        },
        totalCount: allFiltered.length,
        shownCount: items.length,
        total,
        formattedTotal: ctx.monetary.formatNumberValue(total),
        items: items.map((transaction) => ({
          id: transaction.id,
          date: transaction.date,
          period: transaction.period,
          title: pickTransactionTitle(
            {
              description: transaction.description,
              note: transaction.note,
              reference: transaction.reference,
              payeeName: transaction.payee?.name,
              categoryName: transaction.category.name,
            },
            ctx.t,
          ),
          description: transaction.description,
          note: transaction.note,
          reference: transaction.reference,
          type: transaction.type,
          status: transaction.status,
          amount: transaction.amount,
          formattedAmount: ctx.monetary.formatNumberValue(transaction.amount),
          accountName: transaction.account.name,
          categoryName: transaction.category.name,
          groupName: transaction.category.group.name,
          payeeName: transaction.payee?.name ?? null,
        })),
      }
    },
  })
}

