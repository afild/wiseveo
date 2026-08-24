import { tool } from "ai"
import { z } from "zod"
import { getUpcomingTransactions } from "@/features/dashboard/services/get-upcoming-transactions"
import { clampToolLimit, resolveUpcomingRange } from "./tool-utils"
import type { AgentToolContext } from "@/features/ai/types/agent.types"

export function createUpcomingTransactionsTool(userId: string, ctx: AgentToolContext) {
  return tool({
    // Tool metadata below (description/describe) is an LLM function-calling
    // definition, not UI copy — kept in Portuguese and i18n-ignored throughout.
    description:
      "Lista proximos vencimentos financeiros do usuario. Use para perguntas sobre contas a pagar, contas a receber, vencimentos futuros e lancamentos pendentes.", // i18n-ignore
    inputSchema: z.object({
      from: z.string().optional().describe("Data inicial no formato YYYY-MM-DD. Padrao: hoje."), // i18n-ignore
      to: z.string().optional().describe("Data final no formato YYYY-MM-DD."), // i18n-ignore
      days: z.number().int().positive().max(180).optional().describe("Janela futura em dias."), // i18n-ignore
      limit: z.number().int().positive().max(20).optional().describe("Quantidade maxima de itens."), // i18n-ignore
    }),
    execute: async ({ from, to, days, limit }) => {
      const range = resolveUpcomingRange({ from, to, days })
      const take = clampToolLimit(limit)
      const items = await getUpcomingTransactions(userId, range.from, range.to, take)

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
