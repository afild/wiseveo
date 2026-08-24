import { tool } from "ai"
import { z } from "zod"
import { getDreData } from "@/features/analysis/services/get-dre-data"
import { resolveToolRange } from "./tool-utils"
import type { AgentToolContext } from "@/features/ai/types/agent.types"
import type { MonetaryFormatter } from "@/lib/monetary"

function formatLineItem(
  item: { groupCode: string; groupName: string; amount: number; percentage: number; transactionCount: number },
  monetary: MonetaryFormatter,
) {
  return {
    ...item,
    formattedAmount: monetary.formatNumberValue(item.amount),
    formattedPercentage: `${item.percentage.toFixed(2)}%`,
  }
}

export function createDreTool(userId: string, ctx: AgentToolContext) {
  return tool({
    // Tool metadata below (description/describe) is an LLM function-calling
    // definition, not UI copy — kept in Portuguese and i18n-ignored throughout.
    description:
      "Retorna a DRE do periodo com receitas, despesas, transferencias, resultado operacional e principais grupos.", // i18n-ignore
    inputSchema: z.object({
      from: z.string().optional().describe("Data inicial no formato YYYY-MM-DD. Padrao: inicio do mes atual."), // i18n-ignore
      to: z.string().optional().describe("Data final no formato YYYY-MM-DD. Padrao: fim do mes atual."), // i18n-ignore
      limit: z.number().int().positive().max(20).optional().describe("Quantidade maxima de grupos por secao."), // i18n-ignore
    }),
    execute: async ({ from, to, limit }) => {
      const range = resolveToolRange({ from, to })
      const data = await getDreData(userId, range.from, range.to, ctx.locale)
      const take = Math.max(1, Math.min(limit ?? 5, 20))

      return {
        period: {
          from: range.from.toISOString(),
          to: range.to.toISOString(),
          days: data.periodDays,
        },
        summary: {
          ...data.summary,
          formattedIncome: ctx.monetary.formatNumberValue(data.summary.income),
          formattedExpense: ctx.monetary.formatNumberValue(data.summary.expense),
          formattedTransferIn: ctx.monetary.formatNumberValue(data.summary.transferIn),
          formattedTransferOut: ctx.monetary.formatNumberValue(data.summary.transferOut),
          formattedOperationalNet: ctx.monetary.formatNumberValue(data.summary.operationalNet),
          formattedNet: ctx.monetary.formatNumberValue(data.summary.net),
          formattedAverageDailyNet: ctx.monetary.formatNumberValue(data.summary.averageDailyNet),
          formattedMarginPercentage:
            data.summary.marginPercentage == null ? null : `${data.summary.marginPercentage.toFixed(2)}%`,
        },
        topIncomeGroups: data.incomeGroups.slice(0, take).map((item) => formatLineItem(item, ctx.monetary)),
        topExpenseGroups: data.expenseGroups.slice(0, take).map((item) => formatLineItem(item, ctx.monetary)),
        topTransferInGroups: data.transferInGroups.slice(0, take).map((item) => formatLineItem(item, ctx.monetary)),
        topTransferOutGroups: data.transferOutGroups.slice(0, take).map((item) => formatLineItem(item, ctx.monetary)),
      }
    },
  })
}
