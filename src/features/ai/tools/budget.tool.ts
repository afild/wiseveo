import { tool } from "ai"
import { z } from "zod"
import { getBudgetData } from "@/features/budget/services/get-budget-data"
import { clampToolLimit, parseToolDate } from "./tool-utils"
import type { AgentToolContext } from "@/features/ai/types/agent.types"

export function createBudgetTool(userId: string, ctx: AgentToolContext) {
  return tool({
    // Tool metadata below (description/describe) is an LLM function-calling
    // definition, not UI copy — kept in Portuguese and i18n-ignored throughout.
    description:
      "Retorna o orcamento do mes, execucao por grupo/categoria e percentual consumido. Use para perguntas sobre limite, gasto planejado e estouro de orcamento.", // i18n-ignore
    inputSchema: z.object({
      referenceDate: z.string().optional().describe("Data de referencia no formato YYYY-MM-DD. Padrao: mes atual."), // i18n-ignore
      limit: z.number().int().positive().max(20).optional().describe("Quantidade maxima de itens."), // i18n-ignore
      overBudgetOnly: z.boolean().optional().describe("Quando true, retorna apenas itens acima do limite."), // i18n-ignore
    }),
    execute: async ({ referenceDate, limit, overBudgetOnly }) => {
      const date = referenceDate ? parseToolDate(referenceDate, new Date(), "start") : new Date()
      // getBudgetData has no getTranslations()/localized fallback strings (unlike
      // getDreData) — group/category names come straight from the DB — so there
      // is no locale to forward here.
      const data = await getBudgetData(userId, date)
      const take = clampToolLimit(limit, 10)
      const filteredItems = data.items
        .filter((item) => !overBudgetOnly || (item.limit > 0 && item.spent > item.limit))
        .sort((a, b) => {
          const aPct = a.limit > 0 ? a.spent / a.limit : 0
          const bPct = b.limit > 0 ? b.spent / b.limit : 0
          return bPct - aPct
        })
        .slice(0, take)

      return {
        referenceDate: date.toISOString(),
        totals: {
          limit: data.totalLimit,
          spent: data.totalSpent,
          paid: data.totalPaid,
          scheduled: data.totalScheduled,
          overallPct: data.overallPct,
          formattedLimit: ctx.monetary.formatNumberValue(data.totalLimit),
          formattedSpent: ctx.monetary.formatNumberValue(data.totalSpent),
          formattedPaid: ctx.monetary.formatNumberValue(data.totalPaid),
          formattedScheduled: ctx.monetary.formatNumberValue(data.totalScheduled),
          formattedOverallPct: `${data.overallPct.toFixed(2)}%`,
        },
        count: filteredItems.length,
        items: filteredItems.map((item) => {
          const pct = item.limit > 0 ? (item.spent / item.limit) * 100 : 0

          return {
            id: item.id,
            name: item.name,
            originalName: item.originalName,
            isGroup: item.isGroup,
            limit: item.limit,
            spent: item.spent,
            paidAmount: item.paidAmount,
            scheduledAmount: item.scheduledAmount,
            percentUsed: pct,
            remaining: item.limit - item.spent,
            formattedLimit: ctx.monetary.formatNumberValue(item.limit),
            formattedSpent: ctx.monetary.formatNumberValue(item.spent),
            formattedPaidAmount: ctx.monetary.formatNumberValue(item.paidAmount),
            formattedScheduledAmount: ctx.monetary.formatNumberValue(item.scheduledAmount),
            formattedPercentUsed: `${pct.toFixed(2)}%`,
            formattedRemaining: ctx.monetary.formatNumberValue(item.limit - item.spent),
          }
        }),
      }
    },
  })
}
