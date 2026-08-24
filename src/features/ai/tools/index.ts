import { createAccountBalancesTool } from "./accounts.tool";
import { createBudgetTool } from "./budget.tool";
import { createCalendarDayTool } from "./calendar.tool";
import { createDreTool } from "./dre.tool";
import { createLatestTransactionsTool } from "./latest-transactions.tool";
import { createRecurringTransactionsTool } from "./recurring.tool";
import { createSummaryTool } from "./summary.tool";
import { createTransactionsTool } from "./transactions.tool";
import { createUpcomingTransactionsTool } from "./upcoming-transactions.tool";
import { createInsightsTool, createMonthlyFlowsTool } from "./insights.tool";
import { createChartOfAccountsTool } from "./chart-of-accounts.tool";
import type { AgentToolContext } from "@/features/ai/types/agent.types";

/** As consultas do caminho barato do Telegram (uma por intenção classificada). */
export const getTools = (userId: string, ctx: AgentToolContext) => ({
  get_upcoming_transactions: createUpcomingTransactionsTool(userId, ctx),
  get_latest_transactions: createLatestTransactionsTool(userId, ctx),
  get_transactions: createTransactionsTool(userId, ctx),
  get_recurring_transactions: createRecurringTransactionsTool(userId, ctx),
  get_account_balances: createAccountBalancesTool(userId, ctx),
  get_financial_summary: createSummaryTool(userId, ctx),
  get_dre: createDreTool(userId, ctx),
  get_budget: createBudgetTool(userId, ctx),
  get_calendar_day: createCalendarDayTool(userId, ctx),
});

/**
 * Tudo que o AGENTE pode usar: as consultas acima mais o que ele precisa para
 * raciocinar sozinho — os 12 indicadores, a série mensal e o plano de contas
 * (para descobrir os nomes REAIS antes de filtrar, em vez de chutar).
 *
 * Só LEITURA. A ferramenta de lançar transação está desenhada em
 * `write-transaction.tool.ts` e fica DESLIGADA até a Etapa 5.
 */
export const getAgentTools = (userId: string, ctx: AgentToolContext) => ({
  ...getTools(userId, ctx),
  get_financial_insights: createInsightsTool(userId, ctx),
  get_monthly_flows: createMonthlyFlowsTool(userId, ctx),
  get_chart_of_accounts: createChartOfAccountsTool(userId, ctx),
});
