import { getFinancialSummary } from "@/features/shared/services/get-financial-summary"
import { getUpcomingTransactions } from "@/features/dashboard/services/get-upcoming-transactions"
import { endOfUTCDay, startOfUTCDay } from "@/lib/financial"
import type { MonetaryFormatter } from "@/lib/monetary"

/**
 * A abertura da página Advisor: o retrato do mês em três números, já na moeda
 * do usuário, mais o que vence nos próximos dias.
 *
 * É DETERMINÍSTICO de propósito — nada de IA aqui. Chamar o agente a cada visita
 * custaria dinheiro e deixaria a página vinte segundos em branco antes de dizer
 * qualquer coisa. O agente entra quando a pessoa pergunta; a abertura só a
 * coloca dentro do assunto na hora.
 */

const UPCOMING_WINDOW_DAYS = 7

export interface AdvisorOpening {
  income: string
  expense: string
  savings: string
  savingsIsPositive: boolean
  upcomingCount: number
  upcomingTotal: string
}

export async function getAdvisorOpening(
  userId: string,
  monetary: MonetaryFormatter,
  now = new Date(),
): Promise<AdvisorOpening> {
  // Tudo em UTC, como o resto do sistema: misturar o "início do mês" do fuso do
  // servidor com os cortes em UTC daria um mês diferente fora de UTC.
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const to = endOfUTCDay(now)
  const upcomingTo = endOfUTCDay(new Date(now.getTime() + UPCOMING_WINDOW_DAYS * 24 * 60 * 60 * 1000))

  const [summary, upcoming] = await Promise.all([
    getFinancialSummary(userId, from, to),
    getUpcomingTransactions(userId, startOfUTCDay(now), upcomingTo),
  ])

  const upcomingTotal = upcoming.reduce((total, item) => total + Math.abs(item.amount), 0)

  return {
    income: monetary.formatNumberValue(summary.income),
    expense: monetary.formatNumberValue(summary.expense),
    savings: monetary.formatNumberValue(summary.savings),
    savingsIsPositive: summary.savings >= 0,
    upcomingCount: upcoming.length,
    upcomingTotal: monetary.formatNumberValue(upcomingTotal),
  }
}
