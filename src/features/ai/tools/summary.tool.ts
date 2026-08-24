import { tool } from "ai";
import { z } from "zod";
import { getFinancialSummary } from "@/features/shared/services/get-financial-summary";
import { resolveToolRange } from "./tool-utils";
import type { AgentToolContext } from "@/features/ai/types/agent.types";

export const createSummaryTool = (userId: string, ctx: AgentToolContext) => tool({
  // Tool metadata below is an LLM function-calling definition, not UI copy —
  // kept in Portuguese and i18n-ignored.
  description: "Obtem um resumo financeiro (entradas, saidas, saldo/economia) para um periodo especifico. Use para perguntas como 'como foi meu mes', 'resumo de gastos', 'qual meu saldo'.", // i18n-ignore
  inputSchema: z.object({
    from: z.string().optional().describe("Data de inicio no formato YYYY-MM-DD. Padrao: inicio do mes atual."), // i18n-ignore
    to: z.string().optional().describe("Data de fim no formato YYYY-MM-DD. Padrao: fim do mes atual."), // i18n-ignore
  }),
  execute: async ({ from, to }) => {
    const range = resolveToolRange({ from, to });
    const summary = await getFinancialSummary(userId, range.from, range.to);

    return {
      period: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      },
      ...summary,
      formattedIncome: ctx.monetary.formatNumberValue(summary.income),
      formattedExpense: ctx.monetary.formatNumberValue(summary.expense),
      formattedSavings: ctx.monetary.formatNumberValue(summary.savings),
    };
  },
});
