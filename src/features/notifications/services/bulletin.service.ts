import { createDateFormatter } from "@/i18n/format"
import { LOCALE_META } from "@/i18n/config"
import { getFinancialSummary } from "@/features/shared/services/get-financial-summary"
import { getUpcomingTransactions } from "@/features/dashboard/services/get-upcoming-transactions"
import { aiGenerateText } from "@/features/ai/services/llm.service"
import type { CardData } from "@/features/telegram/types/telegram.types"
import {
  utcDayRange,
  utcDaysBackRange,
  utcDaysForwardRange,
  utcMonthRange,
  type ZonedParts,
} from "../lib/schedule"
import { getKpiAverages } from "./kpi-snapshot.service"
import type { NotificationContext } from "../types/notifications.types"

/**
 * O boletim: um card com o retrato do período (os mesmos cards que o bot já
 * manda) e, embaixo, algumas linhas de análise escritas pela IA.
 *
 * Os NÚMEROS são determinísticos — saem do banco, não do modelo. A IA recebe os
 * valores já formatados e só comenta. Assim o boletim nunca traz número
 * inventado, e sem IA configurada (ou com o teto do mês batido) ele continua
 * saindo: perde o comentário, não o conteúdo.
 */

export type BulletinKind = "dailyDigest" | "weeklyDigest" | "monthlyDigest"

/** Quantos dias o boletim semanal olha para trás e para a frente. */
const WEEK_DAYS = 7
/** Teto da análise — é uma mensagem, não um relatório. */
const ANALYSIS_MAX_TOKENS = 320

export interface BulletinContent {
  card: CardData
  /** Análise da IA; `null` quando a IA não estava disponível. */
  analysis: string | null
}

interface BulletinFigures {
  periodLabel: string
  income: number
  expense: number
  net: number
  upcomingCount: number
  upcomingTotal: number
  /** Só no mensal: média dos meses já fotografados. */
  averageNet: number | null
  averageMonths: number
}

function resolveRanges(kind: BulletinKind, parts: ZonedParts) {
  if (kind === "dailyDigest") {
    // O mês até hoje, com o que vence HOJE: o retrato de quem abre a manhã.
    const month = utcMonthRange(parts.year, parts.month)
    const today = utcDayRange(parts.year, parts.month, parts.day)
    return {
      period: { from: month.from, to: today.to },
      upcoming: today,
    }
  }

  if (kind === "weeklyDigest") {
    // Sete dias fechados (termina ONTEM) e a semana que vem pela frente.
    const yesterday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - 1))
    const past = utcDaysBackRange(
      yesterday.getUTCFullYear(),
      yesterday.getUTCMonth() + 1,
      yesterday.getUTCDate(),
      WEEK_DAYS,
    )
    return {
      period: past,
      upcoming: utcDaysForwardRange(parts.year, parts.month, parts.day, WEEK_DAYS),
    }
  }

  // Mensal: o último mês FECHADO, o único que já não muda mais.
  const previousMonth = new Date(Date.UTC(parts.year, parts.month - 2, 1))
  return {
    period: utcMonthRange(previousMonth.getUTCFullYear(), previousMonth.getUTCMonth() + 1),
    upcoming: utcDaysForwardRange(parts.year, parts.month, parts.day, WEEK_DAYS),
  }
}

function periodKey(date: Date): string {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

/**
 * O rótulo do período, sempre lido em UTC.
 *
 * As pontas do intervalo são instantes UTC que representam DIAS de calendário
 * (o dia 1 do mês é meia-noite UTC). Formatar isso no relógio do servidor faria
 * o boletim de julho chegar intitulado "junho" em qualquer máquina a oeste de
 * Greenwich — e o intervalo semanal aparecer com oito dias.
 */
export function buildPeriodLabel(
  kind: BulletinKind,
  range: { from: Date; to: Date },
  locale: string,
): string {
  if (kind === "monthlyDigest") {
    return createDateFormatter(locale, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(range.from)
  }

  if (kind === "weeklyDigest") {
    const short = createDateFormatter(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    })
    return `${short.format(range.from)} – ${short.format(range.to)}`
  }

  return createDateFormatter(locale, { dateStyle: "long", timeZone: "UTC" }).format(range.to)
}

async function collectFigures(
  dataOwnerId: string,
  kind: BulletinKind,
  parts: ZonedParts,
  locale: string,
): Promise<BulletinFigures> {
  const ranges = resolveRanges(kind, parts)

  const [summary, upcoming, averages] = await Promise.all([
    getFinancialSummary(dataOwnerId, ranges.period.from, ranges.period.to),
    // Sem o recorte por "hoje do servidor": o dia aqui é o do CALENDÁRIO da
    // pessoa, e quem está a oeste de Greenwich à noite ainda está no dia
    // anterior em UTC — o recorte devolveria lista vazia e o boletim diria
    // "nada vence hoje" para quem tem contas vencendo hoje.
    getUpcomingTransactions(dataOwnerId, ranges.upcoming.from, ranges.upcoming.to, 60, {
      clampToToday: false,
    }),
    kind === "monthlyDigest"
      ? getKpiAverages(dataOwnerId, periodKey(ranges.period.from))
      : Promise.resolve(null),
  ])

  return {
    periodLabel: buildPeriodLabel(kind, ranges.period, locale),
    income: summary.income,
    expense: summary.expense,
    net: summary.savings,
    upcomingCount: upcoming.length,
    upcomingTotal: upcoming.reduce((total, item) => total + Math.abs(item.amount), 0),
    averageNet: averages?.net ?? null,
    averageMonths: averages?.months ?? 0,
  }
}

function buildInsight(kind: BulletinKind, figures: BulletinFigures, ctx: NotificationContext): string {
  const money = (value: number) => ctx.monetary.formatNumberValue(value)

  if (kind === "monthlyDigest" && figures.averageNet !== null) {
    return ctx.t("bulletin.vsAverage", {
      months: figures.averageMonths,
      average: money(figures.averageNet),
    })
  }

  if (figures.upcomingCount === 0) {
    return ctx.t(kind === "dailyDigest" ? "bulletin.nothingDueToday" : "bulletin.nothingDueAhead")
  }

  return ctx.t(kind === "dailyDigest" ? "bulletin.dueToday" : "bulletin.dueAhead", {
    count: figures.upcomingCount,
    total: money(figures.upcomingTotal),
  })
}

function buildCard(kind: BulletinKind, figures: BulletinFigures, ctx: NotificationContext): CardData {
  const money = (value: number) => ctx.monetary.formatNumberValue(value)
  const headline =
    kind === "dailyDigest"
      ? ctx.t("bulletin.headlineDaily")
      : kind === "weeklyDigest"
        ? ctx.t("bulletin.headlineWeekly")
        : ctx.t("bulletin.headlineMonthly")

  return {
    type: "summary",
    eyebrow: figures.periodLabel,
    headline,
    value: money(figures.net),
    valueLabel: ctx.t("bulletin.net"),
    insight: buildInsight(kind, figures, ctx),
    items: [
      { label: ctx.t("bulletin.income"), value: money(figures.income), tone: "positive" },
      { label: ctx.t("bulletin.expense"), value: money(figures.expense), tone: "negative" },
      {
        label: ctx.t("bulletin.upcoming"),
        value: money(figures.upcomingTotal),
        detail: String(figures.upcomingCount),
      },
    ],
  }
}

function buildAnalysisPrompt(
  kind: BulletinKind,
  figures: BulletinFigures,
  ctx: NotificationContext,
): { system: string; prompt: string } {
  const money = (value: number) => ctx.monetary.formatNumberValue(value)
  const scope =
    kind === "dailyDigest"
      ? "o mês até hoje" // i18n-ignore: rótulo lido pelo MODELO, não é texto de UI
      : kind === "weeklyDigest"
        ? "os últimos sete dias" // i18n-ignore: rótulo lido pelo MODELO
        : "o mês fechado" // i18n-ignore: rótulo lido pelo MODELO

  // Instruções para o MODELO (conteúdo), não texto de UI. O idioma da RESPOSTA
  // é imposto pela última diretriz. i18n-ignore
  const system = `Você é o analista financeiro pessoal do WISEVEO escrevendo um boletim curto para o dono destes dados.

REGRAS
- Comente APENAS os números recebidos. Não invente, não estime, não calcule nada novo.
- Copie os valores exatamente como estão escritos. Nunca reformate dinheiro.
- 2 a 4 frases curtas no total. Sem título, sem markdown, sem tabela, sem saudação.
- Se algo merecer atenção (sobra negativa, conta a vencer, saída acima do normal), diga em uma frase.
- Não dê conselho de investimento nem recomende produtos financeiros.
- Escreva SEMPRE em ${LOCALE_META[ctx.locale].label}.`

  // Dados enviados ao MODELO — não é texto de UI; cada linha traz o próprio
  // marcador porque o verificador olha linha a linha.
  const lines = [
    `Período: ${figures.periodLabel} (${scope}).`, // i18n-ignore: dado para o MODELO
    `Entradas: ${money(figures.income)}.`, // i18n-ignore: dado para o MODELO
    `Saídas: ${money(figures.expense)}.`, // i18n-ignore: dado para o MODELO
    `Sobra: ${money(figures.net)}.`, // i18n-ignore: dado para o MODELO
    figures.upcomingCount > 0
      ? `A vencer no horizonte do boletim: ${figures.upcomingCount} lançamento(s), somando ${money(figures.upcomingTotal)}.` // i18n-ignore: dado para o MODELO
      : "Nada a vencer no horizonte do boletim.", // i18n-ignore: dado para o MODELO
    figures.averageNet !== null
      ? `Média de sobra dos ${figures.averageMonths} meses já registrados: ${money(figures.averageNet)}.` // i18n-ignore: dado para o MODELO
      : "",
  ].filter(Boolean)

  return { system, prompt: lines.join("\n") }
}

/**
 * Escreve as linhas de análise. Qualquer problema com a IA — sem chave, teto do
 * mês batido, provedor fora do ar — devolve `null`, e o boletim sai só com o
 * card. É a degradação combinada: nunca deixar de enviar por causa da IA.
 */
async function writeAnalysis(
  kind: BulletinKind,
  figures: BulletinFigures,
  ctx: NotificationContext,
): Promise<string | null> {
  try {
    const { system, prompt } = buildAnalysisPrompt(kind, figures, ctx)
    const result = await aiGenerateText({
      tier: "smart",
      system,
      prompt,
      maxOutputTokens: ANALYSIS_MAX_TOKENS,
    })
    return result.text.trim() || null
  } catch {
    // Sem detalhe no log, de propósito: o erro cru de um provedor de IA pode
    // trazer o pedido inteiro — e com ele a chave. A camada de IA já registra
    // qual provedor falhou; aqui basta saber que o boletim saiu sem análise.
    console.warn(`[NOTIFICATIONS] bulletin analysis skipped for ${kind}`)
    return null
  }
}

export async function buildBulletin(input: {
  dataOwnerId: string
  kind: BulletinKind
  parts: ZonedParts
  ctx: NotificationContext
}): Promise<BulletinContent> {
  const figures = await collectFigures(input.dataOwnerId, input.kind, input.parts, input.ctx.locale)
  const card = buildCard(input.kind, figures, input.ctx)
  const analysis = await writeAnalysis(input.kind, figures, input.ctx)
  return { card, analysis }
}
