import type { Prisma } from "@/generated/prisma_new/client"
import { prisma } from "@/lib/prisma"
import { endOfUTCDay } from "@/lib/financial"
import { unpaidStatusFilter } from "@/lib/paid-status"
import { mergeUserPreferenceKey } from "@/features/settings/services/user-preferences-write"
import { PERIOD_RE, addDays, dayKeyOfStored, isDayClosed, isDayKey, isPeriodClosed, type DateClosingPreferences } from "../lib/date-closing"
import { canManageClosing, canManagePin, type Actor } from "../lib/permissions"
import { DateClosedError, SecurityError } from "../lib/http"
import { readOwnerClosing } from "./read-owner-closing"
import type { WriteContext } from "./write-context"

/**
 * SEMPRE a transação que faz a escrita, NUNCA o cliente global: a conferência só é atômica se
 * correr dentro dela (desenho, seção 5). O tipo abaixo diz isso, mas não consegue impor: o
 * `Prisma.TransactionClient` é um `Omit<PrismaClient, ...>`, e por estrutura o cliente global
 * continua sendo aceito pelo compilador. Quem chamar com `prisma` perde a atomicidade em silêncio.
 */
type Tx = Prisma.TransactionClient

const uniq = <T,>(xs: T[]) => Array.from(new Set(xs))

/**
 * Chave ilegível é erro de programação, não "nada a conferir": filtrar em silêncio abriria a
 * guarda para qualquer texto que não fosse exatamente a chave (a trava falharia ABERTA). Vazio,
 * `null` e `undefined` seguem sendo o caso legítimo "período não informado".
 */
function requireKeys(values: Array<string | null | undefined>, kind: "day" | "period", ok: (v: string) => boolean): string[] {
  const out: string[] = []
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue
    if (!ok(value)) {
      // i18n-ignore: erro interno de programação (inglês, como os demais Error internos), nunca chega à tela
      throw new Error(`assertWritable: invalid ${kind} key ${JSON.stringify(value)} (expected ${kind === "day" ? "YYYY-MM-DD" : "YYYYMM"})`)
    }
    out.push(value)
  }
  return out
}

/**
 * Chamar DENTRO da transação que grava (ver o tipo `Tx` acima: passar o cliente global perde a
 * atomicidade). Lança DateClosedError quando algum dia ou competência está fechado e não há
 * override válido. Devolve o fechamento lido (útil para logs).
 */
export async function assertWritable(
  tx: Tx,
  ctx: WriteContext,
  input: { days: Array<string | null | undefined>; periods?: Array<string | null | undefined> },
): Promise<DateClosingPreferences> {
  // Antes de ler o banco: entrada ilegível falha igual em conta fechada e em conta aberta.
  const wantedDays = requireKeys(input.days, "day", isDayKey)
  const wantedPeriods = requireKeys(input.periods ?? [], "period", (p) => PERIOD_RE.test(p))

  const closing = await readOwnerClosing(tx, ctx.ownerId, "share")
  if (closing.closedThrough === null) return closing
  const days = uniq(wantedDays).filter((d) => isDayClosed(d, closing.closedThrough))
  const periods = uniq(wantedPeriods).filter((p) => isPeriodClosed(p, closing.closedThrough))
  if (days.length === 0 && periods.length === 0) return closing
  // O token só vale para quem PODE fechar (matriz da seção 3): USER convidado nunca prossegue.
  const canOverride = canManageClosing(ctx)
  if (ctx.override && canOverride) return closing
  throw new DateClosedError(days, periods, closing.closedThrough, canOverride)
}

export interface UnpaidBlockers {
  count: number
  firstDate: string | null
  lastDate: string | null
  sample: Array<{ id: string; date: string; description: string | null; amount: number; status: string }>
}

/** Não pagos com dia em (fromExclusive, toInclusive]. fromExclusive null = desde o início. */
export async function findUnpaidBlockers(tx: Tx, ownerId: string, fromExclusive: string | null, toInclusive: string): Promise<UnpaidBlockers> {
  const where = {
    userId: ownerId,
    date: { ...(fromExclusive ? { gt: endOfUTCDay(fromExclusive) } : {}), lte: endOfUTCDay(toInclusive) },
    ...unpaidStatusFilter(),
  }
  const [count, sample, bounds] = await Promise.all([
    tx.transaction.count({ where }),
    tx.transaction.findMany({
      where, orderBy: { date: "asc" }, take: 20,
      select: { id: true, date: true, description: true, amount: true, statusLookup: { select: { name: true } } },
    }),
    tx.transaction.aggregate({ where, _min: { date: true }, _max: { date: true } }),
  ])
  return {
    count,
    firstDate: bounds._min.date ? dayKeyOfStored(bounds._min.date) : null,
    lastDate: bounds._max.date ? dayKeyOfStored(bounds._max.date) : null,
    sample: sample.map((s) => ({ id: s.id, date: dayKeyOfStored(s.date), description: s.description, amount: s.amount, status: s.statusLookup.name })),
  }
}

export async function getDateClosingState(actor: Actor) {
  const closing = await readOwnerClosing(prisma, actor.ownerId, null)
  return {
    closedThrough: closing.closedThrough,
    hasPin: closing.pinHash !== null,
    canManageClosing: canManageClosing(actor),
    canManagePin: canManagePin(actor),
    showcase: actor.showcase,
  }
}

/** Fechar até `through`. `today` vem do cliente; o servidor tolera 1 dia sobre o seu próprio UTC. */
export async function closeThrough(actor: Actor, input: { through: string; today: string }, now: Date = new Date()) {
  if (!canManageClosing(actor)) throw new SecurityError("forbidden", 403)
  if (!isDayKey(input.through) || !isDayKey(input.today)) throw new SecurityError("invalidToday", 400)
  const serverTomorrow = addDays(dayKeyOfStored(now), 1)
  const maxAllowed = input.today < serverTomorrow ? input.today : serverTomorrow
  if (input.through > maxAllowed) throw new SecurityError("invalidToday", 400)

  return prisma.$transaction(async (tx) => {
    const closing = await readOwnerClosing(tx, actor.ownerId, "update")
    if (!closing.pinHash) throw new SecurityError("pinNotSet", 428)
    if (closing.closedThrough !== null) {
      if (input.through === closing.closedThrough) return { closedThrough: input.through, changed: false }
      if (input.through < closing.closedThrough) throw new SecurityError("closeWouldReopen", 409)
    }
    // Só SELECT simples em transactions aqui (ACCESS SHARE): nunca FOR UPDATE/FOR SHARE/LOCK, senão
    // forma ciclo com o LOCK TABLE do createTransaction (ver desenho, seção 5).
    const blockers = await findUnpaidBlockers(tx, actor.ownerId, closing.closedThrough, input.through)
    if (blockers.count > 0) throw new SecurityError("unpaidBlockers", 409, { ...blockers })
    await mergeUserPreferenceKey(tx, actor.ownerId, "dateClosing", { closedThrough: input.through })
    return { closedThrough: input.through, changed: true }
  })
}

/** Reabrir a partir de `from`: corte vira from-1 (ou vazio antes do primeiro lançamento). Exige override. */
export async function reopenFrom(ctx: WriteContext, from: string) {
  if (!canManageClosing(ctx)) throw new SecurityError("forbidden", 403)
  // `invalidToday` também aqui de propósito: a lista de códigos é fechada, então o texto de
  // `api.security.invalidToday` precisa servir tanto para fechar quanto para reabrir (Tarefa 10).
  if (!isDayKey(from)) throw new SecurityError("invalidToday", 400)
  if (!ctx.override) throw new SecurityError("pinRequired", 401)

  return prisma.$transaction(async (tx) => {
    const closing = await readOwnerClosing(tx, ctx.ownerId, "update")
    if (closing.closedThrough === null) return { closedThrough: null, changed: false }
    if (from > closing.closedThrough) throw new SecurityError("nothingToReopen", 409)
    const earliest = await tx.transaction.aggregate({ where: { userId: ctx.ownerId }, _min: { date: true } })
    const candidate = addDays(from, -1)
    const next = earliest._min.date && candidate >= dayKeyOfStored(earliest._min.date) ? candidate : null
    await mergeUserPreferenceKey(tx, ctx.ownerId, "dateClosing", { closedThrough: next })
    return { closedThrough: next, changed: true }
  })
}

/** Lançamentos (todos e não pagos) com dia em (fromExclusive, toInclusive]; usado pelo aviso do Telegram. */
export async function countTransactionsBetween(ownerId: string, fromExclusive: string | null, toInclusive: string) {
  const dateWhere = { ...(fromExclusive ? { gt: endOfUTCDay(fromExclusive) } : {}), lte: endOfUTCDay(toInclusive) }
  const [total, bounds, unpaid] = await Promise.all([
    prisma.transaction.count({ where: { userId: ownerId, date: dateWhere } }),
    prisma.transaction.aggregate({ where: { userId: ownerId, date: dateWhere }, _min: { date: true }, _max: { date: true } }),
    prisma.transaction.count({ where: { userId: ownerId, date: dateWhere, ...unpaidStatusFilter() } }),
  ])
  return {
    total,
    unpaid,
    firstDate: bounds._min.date ? dayKeyOfStored(bounds._min.date) : null,
    lastDate: bounds._max.date ? dayKeyOfStored(bounds._max.date) : null,
  }
}

/** Quantos lançamentos deixam de estar protegidos ao reabrir a partir de `from`. */
export async function countProtected(actor: Actor, from: string) {
  if (!canManageClosing(actor)) throw new SecurityError("forbidden", 403)
  if (!isDayKey(from)) throw new SecurityError("invalidToday", 400)
  const closing = await readOwnerClosing(prisma, actor.ownerId, null)
  if (closing.closedThrough === null || from > closing.closedThrough) return { count: 0, closedThrough: closing.closedThrough }
  const count = await prisma.transaction.count({
    where: { userId: actor.ownerId, date: { gt: endOfUTCDay(addDays(from, -1)), lte: endOfUTCDay(closing.closedThrough) } },
  })
  return { count, closedThrough: closing.closedThrough }
}
