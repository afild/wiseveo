import { tool } from "ai"
import { z } from "zod"
import { getLatestTransactions } from "@/features/dashboard/services/get-latest-transactions"
import { clampToolLimit, resolveToolRange } from "./tool-utils"
import type { AgentToolContext } from "@/features/ai/types/agent.types"

export function createLatestTransactionsTool(userId: string, ctx: AgentToolContext) {
  return tool({
    // Tool metadata below (description/describe) is an LLM function-calling
    // definition, not UI copy — kept in Portuguese and i18n-ignored throughout.
    description:
      "Lista os ultimos lancamentos pagos no periodo. Use para perguntas sobre pagamentos recentes, ultimas despesas quitadas ou entradas recebidas.", // i18n-ignore
    inputSchema: z.object({
      from: z.string().optional().describe("Data inicial no formato YYYY-MM-DD. Padrao: inicio do mes atual."), // i18n-ignore
      to: z.string().optional().describe("Data final no formato YYYY-MM-DD. Padrao: fim do mes atual."), // i18n-ignore
      limit: z.number().int().positive().max(20).optional().describe("Quantidade maxima de itens."), // i18n-ignore
    }),
    execute: async ({ from, to, limit }) => {
      const range = resolveToolRange({ from, to })
      const take = clampToolLimit(limit)
      const items = await getLatestTransactions(userId, range.from, range.to, take)

      return {
        period: {
          from: range.from.toISOString(),
          to: range.to.toISOString(),
        },
        count: items.length,
        total: items.reduce((sum, item) => sum + item.amount, 0),
        formattedTotal: ctx.monetary.formatNumberValue(items.reduce((sum, item) => sum + item.amount, 0)),
        items: items.map((item) => ({
          ...item,
          formattedAmount: ctx.monetary.formatNumberValue(item.amount),
        })),
      }
    },
  })
}
