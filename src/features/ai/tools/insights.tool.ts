import { tool } from "ai"
import { z } from "zod"
import { getInsightsData } from "@/features/insights/services/get-insights-data"
import { getMonthlyFlows } from "@/features/insights/services/monthly-series"
import type { AgentToolContext } from "@/features/ai/types/agent.types"

/**
 * Os 12 indicadores da página Insights, numa chamada só: sobra de caixa segura,
 * fôlego de emergência, ritmo do orçamento, custo de atraso, anomalia de gasto,
 * projeção de fim de mês e companhia.
 *
 * É a ferramenta mais cara do agente (dezenas de consultas ao banco). Duas
 * defesas: a descrição diz ao modelo para chamá-la uma vez só, e o resultado
 * fica MEMORIZADO nesta instância — como as ferramentas nascem uma vez por
 * pergunta (`getAgentTools`), chamar duas vezes na mesma resposta não custa
 * nada a mais.
 *
 * Cada indicador traz `state` ("ok" | dados insuficientes | vazio) e `zone`
 * (bom/atenção/crítico): o agente não precisa inventar o julgamento, e sabe
 * quando NÃO afirmar nada. Os valores em dinheiro vêm também em `formatted`,
 * na moeda do usuário — o agente é proibido de formatar por conta própria.
 */
export function createInsightsTool(userId: string, ctx: AgentToolContext) {
  let cached: Awaited<ReturnType<typeof getInsightsData>> | null = null

  return tool({
    // i18n-ignore: descrição lida pelo modelo, não é texto de UI
    description:
      // i18n-ignore: texto lido pelo MODELO, não é UI
      "Retorna os 12 indicadores de saúde financeira do usuário de uma vez: quanto sobra com segurança para gastar (safeToSpend), meses de fôlego (emergencyRunway/personalRunway), ritmo do orçamento (budgetPacing), taxa de poupança, velocidade de queima de caixa, comprometimento com contas fixas, peso das recorrentes, custo de atraso, projeção de caixa, previsão de fim de mês e anomalia de gasto. Use para perguntas amplas sobre a SITUAÇÃO financeira ('como estou?', 'posso gastar?', 'estou no vermelho?', 'quanto tempo meu dinheiro dura?') ou quando precisar de contexto antes de opinar. Cada indicador vem com 'state' (ok/insufficient/empty) e 'zone' (good/warning/critical/neutral): NÃO afirme nada quando state não for 'ok'. Ferramenta cara — chame no máximo uma vez por conversa.",
    inputSchema: z.object({}),
    execute: async () => {
      cached ??= await getInsightsData(userId)
      const data = cached
      const money = (value: number) => ctx.monetary.formatNumberValue(value)

      // Os KPIs vêm em números crus. Aqui vão os MESMOS valores já escritos na
      // moeda do usuário: é deles que o agente deve falar (a regra dele é nunca
      // formatar dinheiro sozinho).
      return {
        ...data,
        formatted: {
          safeToSpend: {
            available: money(data.safeToSpend.available),
            balanceToday: money(data.safeToSpend.balanceToday),
            committed30d: money(data.safeToSpend.committed30d),
            perDay: money(data.safeToSpend.perDay),
          },
          emergencyRunway: { avgMonthlyExpense: money(data.emergencyRunway.avgMonthlyExpense) },
          budgetPacing: {
            totalLimit: money(data.budgetPacing.totalLimit),
            totalSpent: money(data.budgetPacing.totalSpent),
          },
          burnRate: {
            recentMonthly: money(data.burnRate.recentMonthly),
            baselineMonthly: money(data.burnRate.baselineMonthly),
          },
          personalRunway: {
            balanceToday: money(data.personalRunway.balanceToday),
            netMonthly: money(data.personalRunway.netMonthly),
          },
          overdueCost: {
            totalAmount: money(data.overdueCost.totalAmount),
            estimatedCost: money(data.overdueCost.estimatedCost),
          },
          monthEndForecast: {
            projectedOutflow: money(data.monthEndForecast.projectedOutflow),
            avgMonthlyIncome: money(data.monthEndForecast.avgMonthlyIncome),
            bookedMonth: money(data.monthEndForecast.bookedMonth),
          },
          fixedCommitment: { fixedMonthly: money(data.fixedCommitment.fixedMonthly) },
          recurringLoad: {
            monthlyTotal: money(data.recurringLoad.monthlyTotal),
            annualTotal: money(data.recurringLoad.annualTotal),
          },
          spendingAnomaly: {
            anomalies: data.spendingAnomaly.anomalies.map((item) => ({
              ...item,
              formattedAmount: money(item.amount),
            })),
          },
        },
      }
    },
  })
}

/** Série mensal de entradas × saídas — a base de "como foi o ano", tendências e comparações. */
export function createMonthlyFlowsTool(userId: string, ctx: AgentToolContext) {
  return tool({
    // i18n-ignore: descrição lida pelo modelo, não é texto de UI
    description:
      // i18n-ignore: texto lido pelo MODELO, não é UI
      "Retorna a série mensal de entradas e saídas dos últimos meses (mais antigo primeiro, meses sem movimento vêm zerados). Use para tendências, comparações entre meses, 'qual mês gastei mais', evolução ao longo do tempo e médias. Base: data do lançamento, sem filtro de status (pagos e a pagar juntos).",
    inputSchema: z.object({
      months: z
        .number()
        .int()
        .min(2)
        .max(36)
        .nullable()
        // i18n-ignore: texto lido pelo MODELO (descrição de ferramenta/campo), não é UI
        .describe("Quantos meses trazer, contando o atual. Padrão 13 (12 fechados + o corrente)."),
    }),
    execute: async ({ months }) => {
      const flows = await getMonthlyFlows(userId, months ?? 13)
      return {
        count: flows.length,
        items: flows.map((flow) => ({
          period: flow.period,
          income: flow.income,
          outflow: flow.outflow,
          net: flow.income - flow.outflow,
          formattedIncome: ctx.monetary.formatNumberValue(flow.income),
          formattedOutflow: ctx.monetary.formatNumberValue(flow.outflow),
          formattedNet: ctx.monetary.formatNumberValue(flow.income - flow.outflow),
        })),
      }
    },
  })
}
