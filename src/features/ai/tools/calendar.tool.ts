import { tool } from "ai"
import { z } from "zod"
import { getCalendarStatement } from "@/features/calendar/services/get-calendar-statement"
import { endOfUTCDay, startOfUTCDay } from "@/lib/financial"
import { clampToolLimit, parseToolDate, pickTransactionTitle } from "./tool-utils"
import type { AgentToolContext } from "@/features/ai/types/agent.types"

export function createCalendarDayTool(userId: string, ctx: AgentToolContext) {
  return tool({
    // Tool metadata below (description/describe) is an LLM function-calling
    // definition, not UI copy — kept in Portuguese and i18n-ignored throughout.
    description:
      "Retorna o extrato financeiro de um dia especifico, incluindo saldo inicial, saldo final, entradas, saidas e lancamentos do dia.", // i18n-ignore
    inputSchema: z.object({
      date: z.string().describe("Data no formato YYYY-MM-DD."), // i18n-ignore
      limit: z.number().int().positive().max(20).optional().describe("Quantidade maxima de lancamentos."), // i18n-ignore
    }),
    execute: async ({ date, limit }) => {
      const parsedDate = parseToolDate(date, new Date(), "start")
      const from = startOfUTCDay(parsedDate)
      const to = endOfUTCDay(parsedDate)
      const take = clampToolLimit(limit, 10)
      const statement = await getCalendarStatement(userId, from, to)
      const day = statement.days[0]

      if (!day) {
        return {
          date: from.toISOString(),
          openingBalance: 0,
          closingBalance: 0,
          income: 0,
          expense: 0,
          net: 0,
          items: [],
        }
      }

      return {
        date: day.date,
        openingBalance: day.openingBalance,
        closingBalance: day.closingBalance,
        income: day.income,
        expense: day.expense,
        net: day.net,
        formattedOpeningBalance: ctx.monetary.formatNumberValue(day.openingBalance),
        formattedClosingBalance: ctx.monetary.formatNumberValue(day.closingBalance),
        formattedIncome: ctx.monetary.formatNumberValue(day.income),
        formattedExpense: ctx.monetary.formatNumberValue(day.expense),
        formattedNet: ctx.monetary.formatNumberValue(day.net),
        count: day.transactions.length,
        items: day.transactions.slice(0, take).map((transaction) => ({
          id: transaction.id,
          title: pickTransactionTitle(
            {
              description: transaction.description,
              note: transaction.note,
              payeeName: transaction.payee?.name,
              categoryName: transaction.category.name,
            },
            ctx.t,
          ),
          description: transaction.description,
          note: transaction.note,
          type: transaction.type,
          status: transaction.status,
          amount: transaction.amount,
          formattedAmount: ctx.monetary.formatNumberValue(transaction.amount),
          categoryName: transaction.category.name,
          accountName: transaction.account.name,
          payeeName: transaction.payee?.name ?? null,
        })),
      }
    },
  })
}
