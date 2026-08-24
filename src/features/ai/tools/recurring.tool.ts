import { tool } from "ai"
import { z } from "zod"
import { getRecurring } from "@/features/recurring/services/get-recurring"
import {
  clampToolLimit,
  includesSearch,
  pickTransactionTitle,
} from "./tool-utils"
import type { AgentToolContext } from "@/features/ai/types/agent.types"

export function createRecurringTransactionsTool(userId: string, ctx: AgentToolContext) {
  return tool({
    // Tool metadata below (description/describe) is an LLM function-calling
    // definition, not UI copy — kept in Portuguese and i18n-ignored throughout.
    description:
      "Lista modelos de transacoes recorrentes do usuario. Use para perguntas sobre assinaturas, recorrencias, contas fixas e lancamentos automaticos.", // i18n-ignore
    inputSchema: z.object({
      type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]).optional().describe("Tipo da recorrencia."), // i18n-ignore
      accountName: z.string().optional().describe("Nome parcial do banco/conta."), // i18n-ignore
      categoryName: z.string().optional().describe("Nome parcial da categoria."), // i18n-ignore
      groupName: z.string().optional().describe("Nome parcial do grupo."), // i18n-ignore
      search: z.string().optional().describe("Texto livre para buscar em historico, descricao, referencia ou favorecido."), // i18n-ignore
      limit: z.number().int().positive().max(20).optional().describe("Quantidade maxima de itens."), // i18n-ignore
    }),
    execute: async (input) => {
      const take = clampToolLimit(input.limit, 10)
      const { recurring } = await getRecurring(userId)

      const filtered = recurring
        .filter((item) => !input.type || item.type === input.type)
        .filter((item) => includesSearch(item.account.name, input.accountName))
        .filter((item) => includesSearch(item.category.name, input.categoryName))
        .filter((item) => includesSearch(item.category.group.name, input.groupName))
        .filter((item) => {
          if (!input.search) return true

          return [
            item.note,
            item.description,
            item.reference,
            item.payee?.name,
            item.category.name,
            item.category.group.name,
            item.account.name,
          ].some((value) => includesSearch(value, input.search))
        })
        .slice(0, take)

      const total = filtered.reduce((sum, item) => sum + item.amount, 0)

      return {
        count: filtered.length,
        total,
        formattedTotal: ctx.monetary.formatNumberValue(total),
        items: filtered.map((item) => ({
          id: item.id,
          period: item.period,
          lastDate: item.lastDate,
          title: pickTransactionTitle(
            {
              description: item.description,
              note: item.note,
              reference: item.reference,
              payeeName: item.payee?.name,
              categoryName: item.category.name,
            },
            ctx.t,
          ),
          note: item.note,
          description: item.description,
          reference: item.reference,
          type: item.type,
          amount: item.amount,
          formattedAmount: ctx.monetary.formatNumberValue(item.amount),
          accountName: item.account.name,
          categoryName: item.category.name,
          groupName: item.category.group.name,
          statusName: item.status.name,
          payeeName: item.payee?.name ?? null,
        })),
      }
    },
  })
}
