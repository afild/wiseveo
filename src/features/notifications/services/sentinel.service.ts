import { createNumberFormatter } from "@/i18n/format"
import { getInsightsData } from "@/features/insights/services/get-insights-data"
import type { InsightsData } from "@/features/insights/types"
import type { NotificationContext } from "../types/notifications.types"

/**
 * A sentinela: olha os indicadores uma vez por dia e só fala quando algo saiu do
 * normal. Silêncio é o resultado esperado — um aviso diário que chega todo dia
 * vira ruído e ninguém lê mais.
 *
 * Nada de IA aqui, de propósito: o julgamento já está pronto (cada indicador traz
 * o próprio `zone`), a conta não pesa e o alerta continua funcionando numa
 * instalação sem chave de IA nenhuma.
 *
 * Repetição: os detectores comparam o MÊS corrente com o histórico, então um
 * gasto atípico continua atípico até o mês virar. Por isso a sentinela guarda uma
 * ASSINATURA do que avisou; enquanto o quadro não mudar, ela cala.
 */

export interface SentinelContent {
  /** Linhas prontas para enviar; vazio = nada fora do normal. */
  lines: string[]
  /** Resumo estável do que foi detectado — repetido, não se envia de novo. */
  signature: string
}

function formatPercent(value: number, locale: string): string {
  return createNumberFormatter(locale, { style: "percent", maximumFractionDigits: 0 }).format(
    value / 100,
  )
}

/**
 * A regra de "algo saiu do normal", separada da ida ao banco para poder ser
 * testada: entra o retrato dos indicadores, sai o que merece ser dito.
 */
export function collectSentinelAlerts(data: InsightsData, ctx: NotificationContext): SentinelContent {
  const money = (value: number) => ctx.monetary.formatNumberValue(value)
  const lines: string[] = []
  const signature: string[] = []

  // Gasto fora do padrão (z-score modificado com MAD) — qualquer ocorrência
  // conta: o detector já exige desvio grande E valor relevante para acusar.
  if (data.spendingAnomaly.state === "ok" && data.spendingAnomaly.count > 0) {
    for (const item of data.spendingAnomaly.anomalies.slice(0, 3)) {
      lines.push(
        ctx.t("sentinel.anomaly", {
          name: item.name,
          amount: money(item.amount),
          usual: money(item.medianAmount),
        }),
      )
    }
    // Os NOMES entram na assinatura, não só a quantidade: trocar de categoria
    // mantendo o mesmo número é quadro novo, e precisa ser dito.
    const names = data.spendingAnomaly.anomalies.map((item) => item.name).sort().join(",")
    signature.push(`anomaly:${data.spendingAnomaly.count}:${names}`)
  }

  // Orçamento: só no vermelho. "Atenção" no começo do mês é ritmo normal de
  // quem paga aluguel no dia 1 — avisar disso todo dia seria falso alarme.
  if (data.budgetPacing.state === "ok" && data.budgetPacing.zone === "critical") {
    lines.push(
      ctx.t("sentinel.budget", {
        spent: money(data.budgetPacing.totalSpent),
        limit: money(data.budgetPacing.totalLimit),
        percent: formatPercent(data.budgetPacing.usagePct, ctx.locale),
      }),
    )
    signature.push(`budget:${Math.round(data.budgetPacing.usagePct / 5)}`)
  }

  if (data.overdueCost.state === "ok" && data.overdueCost.count > 0) {
    lines.push(
      ctx.t("sentinel.overdue", {
        count: data.overdueCost.count,
        total: money(data.overdueCost.totalAmount),
      }),
    )
    signature.push(`overdue:${data.overdueCost.count}`)
  }

  if (
    data.cashProjection.state === "ok" &&
    data.cashProjection.zone === "critical" &&
    data.cashProjection.daysToNegative !== null
  ) {
    lines.push(
      ctx.t("sentinel.cash", {
        account: data.cashProjection.accountName ?? "",
        days: data.cashProjection.daysToNegative,
      }),
    )
    signature.push(`cash:${data.cashProjection.daysToNegative}`)
  }

  if (
    data.personalRunway.state === "ok" &&
    data.personalRunway.zone === "critical" &&
    data.personalRunway.runwayMonths !== null
  ) {
    lines.push(
      ctx.t("sentinel.runway", {
        // Dois argumentos de propósito: o número CRU escolhe a forma singular ou
        // plural, e o texto já formatado é o que a pessoa lê.
        count: data.personalRunway.runwayMonths,
        months: createNumberFormatter(ctx.locale, { maximumFractionDigits: 1 }).format(
          data.personalRunway.runwayMonths,
        ),
      }),
    )
    signature.push(`runway:${Math.round(data.personalRunway.runwayMonths)}`)
  }

  return { lines, signature: signature.join("|") }
}

export async function buildSentinel(input: {
  dataOwnerId: string
  ctx: NotificationContext
  now?: Date
}): Promise<SentinelContent> {
  const data = await getInsightsData(input.dataOwnerId, input.now ?? new Date())
  return collectSentinelAlerts(data, input.ctx)
}

/** O texto final: título e as linhas detectadas. */
export function formatSentinelMessage(content: SentinelContent, ctx: NotificationContext): string {
  return [ctx.t("sentinel.title"), "", ...content.lines].join("\n")
}
