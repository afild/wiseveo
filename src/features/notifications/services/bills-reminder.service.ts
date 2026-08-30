import { createDateFormatter } from "@/i18n/format"
import { getUpcomingTransactions } from "@/features/dashboard/services/get-upcoming-transactions"
import { utcDaysForwardRange, type ZonedParts } from "../lib/schedule"
import type { NotificationContext } from "../types/notifications.types"

/**
 * O lembrete de contas: "a conta X vence amanhã e ainda está em aberto".
 *
 * Determinístico e barato — nenhuma chamada de IA. A lista já vem filtrada pelo
 * que o sistema inteiro entende por NÃO pago (`src/lib/paid-status.ts`), então
 * conta quitada nunca aparece aqui.
 *
 * Sem nada a vencer, não há mensagem: o silêncio é a resposta certa.
 */

/** Quantos lançamentos cabem numa mensagem antes de virar lista de compras. */
const MAX_ITEMS = 8
/**
 * Quantos lançamentos são BUSCADOS. Bem mais que os exibidos, de propósito: o
 * `take` do banco corta antes da soma, então pedir só nove faria a mensagem
 * anunciar "9 contas" e um total errado para quem tem trinta vencendo.
 */
const FETCH_LIMIT = 200

export interface BillsReminderContent {
  lines: string[]
  count: number
  total: number
}

export async function buildBillsReminder(input: {
  dataOwnerId: string
  parts: ZonedParts
  daysAhead: number
  ctx: NotificationContext
}): Promise<BillsReminderContent> {
  // Começa AMANHÃ: o que vence hoje já foi assunto do boletim da manhã, e um
  // lembrete de algo que vence daqui a poucas horas chega tarde demais.
  const tomorrow = new Date(Date.UTC(input.parts.year, input.parts.month - 1, input.parts.day + 1))
  const range = utcDaysForwardRange(
    tomorrow.getUTCFullYear(),
    tomorrow.getUTCMonth() + 1,
    tomorrow.getUTCDate(),
    input.daysAhead,
  )

  // Sem o recorte por "hoje do servidor": a janela já começa amanhã no
  // calendário da pessoa, que pode ser hoje ou depois de amanhã em UTC.
  const upcoming = await getUpcomingTransactions(
    input.dataOwnerId,
    range.from,
    range.to,
    FETCH_LIMIT,
    { clampToToday: false },
  )
  // SÓ o que se paga. A consulta devolve entradas e saídas juntas, e somar as
  // duas fazia o lembrete anunciar o salário que vai cair dentro do total de
  // "contas a vencer" — um número que não quer dizer nada.
  const items = upcoming.filter((item) => item.type === "EXPENSE")
  const total = items.reduce((sum, item) => sum + Math.abs(item.amount), 0)
  const shown = items.slice(0, MAX_ITEMS)

  // `item.date` é "YYYY-MM-DD" de calendário: montado E lido em UTC, senão o
  // vencimento aparece um dia antes em qualquer servidor a oeste de Greenwich.
  const dayFormatter = createDateFormatter(input.ctx.locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  })

  const lines = shown.map((item) =>
    input.ctx.t("bills.line", {
      title: item.title,
      amount: input.ctx.monetary.formatNumberValue(Math.abs(item.amount)),
      date: dayFormatter.format(new Date(`${item.date}T00:00:00.000Z`)),
    }),
  )

  if (items.length > MAX_ITEMS) {
    lines.push(input.ctx.t("bills.more", { count: items.length - MAX_ITEMS }))
  }

  return { lines, count: items.length, total }
}

export function formatBillsReminderMessage(
  content: BillsReminderContent,
  daysAhead: number,
  ctx: NotificationContext,
): string {
  return [
    ctx.t("bills.title", { days: daysAhead }),
    "",
    ...content.lines,
    "",
    ctx.t("bills.total", {
      count: content.count,
      total: ctx.monetary.formatNumberValue(content.total),
    }),
  ].join("\n")
}
