import { createDateFormatter } from "@/i18n/format"
import { getCalendarStatement } from "@/features/calendar/services/get-calendar-statement"
import { getAccountsWithBalance } from "@/features/accounts/services/get-accounts"
import { getFinancialSummary } from "@/features/shared/services/get-financial-summary"
import { getUpcomingTransactions } from "@/features/dashboard/services/get-upcoming-transactions"
import { getMonthlyFlows } from "@/features/insights/services/monthly-series"
import { isPaidStatusName } from "@/lib/paid-status"
import { endOfUTCDay } from "@/lib/financial"
import {
  utcDayRange,
  utcDaysBackRange,
  utcDaysForwardRange,
  utcMonthRange,
  type ZonedParts,
} from "../lib/schedule"
import { getKpiAverages } from "./kpi-snapshot.service"
import type { NotificationContext } from "../types/notifications.types"
import type { CardBlock } from "@/features/ai/types/response.types"

/**
 * O DOSSIÊ do boletim — tudo que a IA precisa saber para ter o que dizer.
 *
 * Antes ela recebia cinco linhas: período, entradas, saídas, sobra e o total a
 * vencer. Eram exatamente os números que já estavam desenhados no card, e a
 * regra mandava comentar só eles. Com esse insumo, nenhum modelo do mundo faria
 * outra coisa senão repetir o quadro.
 *
 * Agora ela recebe o dia lançamento a lançamento, o saldo em conta, o mês até
 * aqui, os meses anteriores para comparar e o que está por vencer — tudo com os
 * valores JÁ ESCRITOS na moeda da pessoa, porque ela é proibida de formatar
 * dinheiro.
 *
 * Duas correções de verdade vão junto:
 * - O boletim "diário" mostrava os números do MÊS com a manchete "O seu dia".
 * - A "sobra" somava pago e agendado no mesmo balde: uma conta que ainda nem
 *   saiu derrubava o resultado do dia. Agora as duas coisas vêm separadas.
 */

export type BulletinKind = "dailyDigest" | "weeklyDigest" | "monthlyDigest"

/** Quantos lançamentos do período entram no dossiê antes de virar ruído. */
const MAX_LISTED = 40
const WEEK_DAYS = 7

export interface BulletinDossier {
  /** O texto que vai ao modelo. */
  text: string
  /** Rótulo do período, para a pauta. */
  periodLabel: string
  /**
   * O boletim que sai quando a IA NÃO está disponível (sem chave, teto do mês
   * batido, provedor fora do ar). Determinístico, montado com os mesmos números
   * do dossiê: perde o comentário, não o conteúdo.
   */
  fallback: CardBlock
}

function periodKey(date: Date): string {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

/**
 * Os rótulos de período, sempre lidos em UTC.
 *
 * Exportados para o teste: as pontas do intervalo são instantes UTC que
 * representam DIAS de calendário, e formatá-los no relógio do servidor faz o
 * boletim de julho chegar intitulado "junho" a oeste de Greenwich — defeito que
 * não aparece na Vercel, que roda em UTC, e aparece na máquina do dono.
 */
export function monthLabel(period: string, locale: string): string {
  const year = Number(period.slice(0, 4))
  const month = Number(period.slice(4, 6))
  return createDateFormatter(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  )
}

export function dayLabel(date: Date, locale: string): string {
  return createDateFormatter(locale, { dateStyle: "full", timeZone: "UTC" }).format(date)
}

export function shortDay(date: Date, locale: string): string {
  return createDateFormatter(locale, {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(date)
}

export async function buildBulletinDossier(input: {
  dataOwnerId: string
  kind: BulletinKind
  parts: ZonedParts
  ctx: NotificationContext
}): Promise<BulletinDossier> {
  const { ctx, parts } = input
  const money = (value: number) => ctx.monetary.formatNumberValue(value)
  const lines: string[] = []

  const today = utcDayRange(parts.year, parts.month, parts.day)
  const month = utcMonthRange(parts.year, parts.month)
  const previousMonth = new Date(Date.UTC(parts.year, parts.month - 2, 1))
  const closedMonth = utcMonthRange(
    previousMonth.getUTCFullYear(),
    previousMonth.getUTCMonth() + 1,
  )

  const period =
    input.kind === "dailyDigest"
      ? today
      : input.kind === "weeklyDigest"
        ? utcDaysBackRange(
            new Date(Date.UTC(parts.year, parts.month - 1, parts.day - 1)).getUTCFullYear(),
            new Date(Date.UTC(parts.year, parts.month - 1, parts.day - 1)).getUTCMonth() + 1,
            new Date(Date.UTC(parts.year, parts.month - 1, parts.day - 1)).getUTCDate(),
            WEEK_DAYS,
          )
        : closedMonth

  const periodLabel =
    input.kind === "dailyDigest"
      ? dayLabel(today.to, ctx.locale)
      : input.kind === "weeklyDigest"
        ? `${shortDay(period.from, ctx.locale)} – ${shortDay(period.to, ctx.locale)}`
        : monthLabel(periodKey(closedMonth.from), ctx.locale)

  // O saldo em conta é do DIA, sempre — é o número que a pessoa confere no banco.
  const [statement, accounts, monthToDate, upcoming, flows] = await Promise.all([
    getCalendarStatement(input.dataOwnerId, period.from, period.to),
    getAccountsWithBalance(input.dataOwnerId, endOfUTCDay(today.to)),
    getFinancialSummary(input.dataOwnerId, month.from, today.to),
    getUpcomingTransactions(
      input.dataOwnerId,
      utcDaysForwardRange(parts.year, parts.month, parts.day, WEEK_DAYS).from,
      utcDaysForwardRange(parts.year, parts.month, parts.day, WEEK_DAYS).to,
      MAX_LISTED,
      { clampToToday: false },
    ),
    getMonthlyFlows(input.dataOwnerId, 6),
  ])

  const totalBalance = accounts.reduce((sum, account) => sum + account.currentBalance, 0)
  const days = statement.days
  const movement = days.flatMap((day) => day.transactions)

  // Entradas e saídas são contadas AQUI, e não pelos campos prontos do extrato,
  // porque o extrato classifica pelo módulo: tudo que não é receita entra como
  // saída, e a perna POSITIVA de uma transferência interna vira "saída" também.
  // O resultado era uma mensagem que se contradizia — a saída do período não
  // batia com o saldo de fechamento logo abaixo nem com o "mês até hoje".
  // A régua aqui é a mesma de `getFinancialSummary`: saída = despesa + a perna
  // negativa da transferência; a perna positiva não entra em lado nenhum.
  let income = 0
  let expense = 0
  for (const tx of movement) {
    if (tx.type === "INCOME") income += Math.abs(tx.amount)
    else if (tx.type === "EXPENSE") expense += Math.abs(tx.amount)
    else if (tx.amount < 0) expense += Math.abs(tx.amount)
  }

  // "A vencer" NÃO é um número só: somar o salário que vai cair com a conta que
  // vai vencer produz um total que não quer dizer nada.
  const payable = upcoming.filter((item) => item.type === "EXPENSE")
  const receivable = upcoming.filter((item) => item.type === "INCOME")
  const payableTotal = payable.reduce((sum, item) => sum + Math.abs(item.amount), 0)
  const receivableTotal = receivable.reduce((sum, item) => sum + Math.abs(item.amount), 0)

  // i18n-ignore: rótulos do dossiê, lidos pelo MODELO — não são texto de tela
  lines.push(`PERÍODO DO BOLETIM: ${periodLabel}.`)
  // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
  lines.push(`SALDO EM CONTA HOJE (todas as contas somadas): ${money(totalBalance)}.`)
  for (const account of accounts.slice(0, 8)) {
    lines.push(`  · conta "${account.name}": ${money(account.currentBalance)}`)
  }

  lines.push("")
  // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
  lines.push(`MOVIMENTO DO PERÍODO: entradas ${money(income)}, saídas ${money(expense)}, resultado ${money(income - expense)}.`)
  if (days.length > 0) {
    lines.push(
      // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
      `Saldo de abertura do período ${money(days[0].openingBalance)} e de fechamento ${money(days[days.length - 1].closingBalance)}.`,
    )
  }

  if (movement.length === 0) {
    // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
    lines.push("Nenhum lançamento no período.")
  } else {
    // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
    lines.push(`LANÇAMENTOS DO PERÍODO (${movement.length}):`)
    for (const day of days) {
      for (const tx of day.transactions.slice(0, MAX_LISTED)) {
        const title = tx.description?.trim() || tx.payee?.name?.trim() || tx.note?.trim() || tx.category.name
        // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
        const pago = isPaidStatusName(tx.status) ? "pago" : "ainda não pago"
        lines.push(
          `  · ${shortDay(new Date(`${day.date}T00:00:00.000Z`), ctx.locale)} | ${title} | ${money(Math.abs(tx.amount))} | ${tx.type} | ${pago} | categoria "${tx.category.name}" | conta "${tx.account.name}"`,
        )
      }
    }
  }

  lines.push("")
  lines.push(
    // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
    `MÊS ATÉ HOJE (${monthLabel(periodKey(month.from), ctx.locale)}): entradas ${money(monthToDate.income)}, saídas ${money(monthToDate.expense)}, sobra ${money(monthToDate.savings)}.`,
  )
  lines.push(
    // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
    "ATENÇÃO: essa sobra do mês soma o que já foi pago E o que ainda está agendado. Não afirme que a pessoa está no vermelho sem olhar os lançamentos acima e ver o que ainda não saiu.",
  )

  lines.push("")
  // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
  lines.push("MESES ANTERIORES (para comparar, o último é o mês corrente e ainda está em andamento):")
  for (const flow of flows) {
    lines.push(
      // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
      `  · ${monthLabel(flow.period, ctx.locale)}: entradas ${money(flow.income)}, saídas ${money(flow.outflow)}, resultado ${money(flow.income - flow.outflow)}`,
    )
  }

  lines.push("")
  if (upcoming.length === 0) {
    // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
    lines.push("A VENCER nos próximos 7 dias: nada em aberto.")
  } else {
    // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
    lines.push(`A PAGAR nos próximos 7 dias: ${payable.length} conta(s), somando ${money(payableTotal)}.`)
    lines.push(
      receivable.length > 0
        ? // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
          `A RECEBER nos próximos 7 dias: ${receivable.length} lançamento(s), somando ${money(receivableTotal)}. NÃO some este valor com o que há a pagar.`
        : // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
          "A RECEBER nos próximos 7 dias: nada.",
    )
    for (const item of upcoming.slice(0, 15)) {
      lines.push(
        `  · ${shortDay(new Date(`${item.date}T00:00:00.000Z`), ctx.locale)} | ${item.title} | ${money(Math.abs(item.amount))} | ${item.type} | categoria "${item.categoryName}"`,
      )
    }
  }

  if (input.kind === "monthlyDigest") {
    const averages = await getKpiAverages(input.dataOwnerId, periodKey(closedMonth.from))
    lines.push("")
    lines.push(
      averages
        // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
        ? `MÉDIA DOS ${averages.months} MESES JÁ REGISTRADOS: entradas ${money(averages.income)}, saídas ${money(averages.outflow)}, sobra ${money(averages.net)}.`
        // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
        : "MÉDIA HISTÓRICA: ainda não há fotos mensais suficientes para comparar. Não invente média; use os meses anteriores listados acima.",
    )
  }

  const fallback: CardBlock = {
    kind: "card",
    eyebrow: periodLabel,
    headline: ctx.t("bulletin.fallbackHeadline"),
    highlight: {
      label: ctx.t("bulletin.balance"),
      value: money(totalBalance),
      tone: totalBalance >= 0 ? "default" : "negative",
    },
    rows: [
      { label: ctx.t("bulletin.income"), value: money(income), detail: null, tone: "positive" },
      { label: ctx.t("bulletin.expense"), value: money(expense), detail: null, tone: "negative" },
      {
        label: ctx.t("bulletin.net"),
        value: money(income - expense),
        detail: null,
        tone: income - expense >= 0 ? "positive" : "negative",
      },
      {
        // Só o que se PAGA: misturar com o que se recebe daria um total sem sentido.
        label: ctx.t("bulletin.upcoming"),
        value: money(payableTotal),
        detail: String(payable.length),
        tone: "default",
      },
    ],
    footnote: null,
  }

  return { text: lines.join("\n"), periodLabel, fallback }
}
