import { startOfMonth, endOfMonth } from "date-fns"

/** Data de calendário pura: "2026-07-31" ou "2026-07". Nunca um instante. */
const CALENDAR_DATE_RE = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/

/**
 * O período do Orçamento trafega como DATA DE CALENDÁRIO, nunca como instante.
 *
 * Um instante enviado pelo cliente ("2026-07-31 23:59:59" em UTC-3 vira
 * "2026-08-01T02:59:59.999Z") é lido por um servidor em outro fuso — a Vercel
 * roda em UTC — como 1º de agosto. Ao fechar o mês inteiro, o range de julho
 * virava julho+agosto: "Orçado Total" saía dobrado e "Gasto Total" somava dois
 * meses de despesas.
 *
 * Por isso um valor com hora é REJEITADO em vez de aproximado: preferimos a
 * rota responder 400 (e a página manter os números do mês corrente) a exibir
 * silenciosamente o dobro do dinheiro.
 */
export function parseCalendarDate(value: string | null | undefined): Date | null {
  if (!value) return null

  const match = value.match(CALENDAR_DATE_RE)
  if (!match) return null

  const [, year, month, day] = match
  const monthIndex = Number(month) - 1
  if (monthIndex < 0 || monthIndex > 11) return null

  const parsed = new Date(Number(year), monthIndex, day ? Number(day) : 1)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Resolve o range da página de Orçamento em meses inteiros (a página sempre
 * raciocina em mês fechado — ranges parciais não são suportados pelo motor).
 * Devolve `null` quando um parâmetro veio preenchido mas ilegível, para a rota
 * responder 400 em vez de silenciosamente cair no mês corrente.
 */
export function resolveBudgetRange(
  fromValue: string | null | undefined,
  toValue: string | null | undefined,
  fallback: Date
): { from: Date; to: Date } | null {
  const fromParsed = parseCalendarDate(fromValue)
  if (fromValue && !fromParsed) return null

  const toParsed = parseCalendarDate(toValue)
  if (toValue && !toParsed) return null

  const from = startOfMonth(fromParsed ?? fallback)
  const to = endOfMonth(toParsed ?? fromParsed ?? fallback)

  return { from, to }
}
