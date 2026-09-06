import { prisma } from "@/lib/prisma"
import { getAccountsWithBalance } from "@/features/accounts/services/get-accounts"
import { getDailyStatement } from "@/features/shared/services/get-daily-statement"
import {
  endOfPeriodUtc,
  pickWorstAhead,
  resolveLaunchedThrough,
  type BalancePoint,
} from "../lib/radar-window"

const DAY_MS = 24 * 60 * 60 * 1000
/** Meses de histórico puxados só para calcular a densidade (mediana de 3 fechados). */
const DENSITY_MONTHS_BACK = 3
/** Meses à frente puxados para a densidade: cobre a janela máxima de 365 dias com folga. */
const DENSITY_MONTHS_AHEAD = 15

export interface RadarLookahead {
  /** Dia do menor saldo previsto, "AAAA-MM-DD". */
  worstDate: string
  worstBalance: number
  /** Último dia realmente observado, "AAAA-MM-DD". */
  horizonDate: string
  /** Dias entre hoje e o horizonte. Zero quando não há nada à frente. */
  horizonDays: number
  /** Dias que a preferência pediu. */
  requestedDays: number
  /** true quando o horizonte de dados encurtou a janela pedida. */
  truncated: boolean
}

export interface RadarSnapshot {
  todayBalance: number | null
  monthEndBalance: number | null
  lookahead: RadarLookahead | null
}

function dateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`
}

function periodKey(date: Date): string {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

/**
 * Retrato do radar num intervalo que começa no dia 1 do mês corrente e vai até o mais distante
 * entre o fim do mês e a janela pedida.
 *
 * O início NÃO é hoje de propósito: o saldo de abertura e o extrato do período usam universos de
 * conta diferentes (a semente descarta contas desativadas, o extrato não), então mover essa linha
 * mudaria o saldo de hoje já exibido na barra lateral. Só se acrescentam dias no fim.
 */
export async function getRadarSnapshot(
  userId: string,
  requestedDays: number,
  now: Date,
): Promise<RadarSnapshot> {
  const today = startOfUtcDay(now)
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
  const monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0))
  const requestedEnd = new Date(today.getTime() + requestedDays * DAY_MS)
  const lastDay = requestedEnd.getTime() > monthEnd.getTime() ? requestedEnd : monthEnd
  const to = new Date(lastDay.getTime() + DAY_MS - 1)

  const densityFrom = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - DENSITY_MONTHS_BACK, 1),
  )
  const densityTo = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + DENSITY_MONTHS_AHEAD, 0, 23, 59, 59, 999),
  )

  const [statement, openingBalances, densityRows] = await Promise.all([
    getDailyStatement(userId, from, to),
    getAccountsWithBalance(userId, new Date(from.getTime() - 1)),
    prisma.transaction.groupBy({
      by: ["period"],
      _count: { _all: true },
      where: { userId, date: { gte: densityFrom, lte: densityTo } },
    }),
  ])

  const byDay = new Map(statement.map((entry) => [entry.date, entry]))
  let runningBalance = openingBalances.reduce(
    (sum, account) => sum + account.currentBalance,
    0,
  )

  const points: BalancePoint[] = []
  for (
    let cursor = from;
    cursor.getTime() <= lastDay.getTime();
    cursor = new Date(cursor.getTime() + DAY_MS)
  ) {
    const key = dateKey(cursor)
    runningBalance += byDay.get(key)?.net ?? 0
    points.push({ date: key, balance: runningBalance })
  }

  const balanceByDate = new Map(points.map((point) => [point.date, point.balance]))
  const todayKey = dateKey(today)
  const todayBalance = balanceByDate.get(todayKey) ?? null
  const monthEndBalance = balanceByDate.get(dateKey(monthEnd)) ?? null

  const launched = resolveLaunchedThrough(
    densityRows.map((row) => ({ period: row.period, count: row._count._all })),
    periodKey(today),
  )

  let horizonDay: Date
  if (launched.kind === "no-baseline") {
    horizonDay = requestedEnd
  } else if (launched.kind === "current-month-empty") {
    horizonDay = today
  } else {
    const launchedEnd = endOfPeriodUtc(launched.through)
    horizonDay = launchedEnd.getTime() < requestedEnd.getTime() ? launchedEnd : requestedEnd
  }
  if (horizonDay.getTime() < today.getTime()) horizonDay = today

  const worst = pickWorstAhead(points, todayKey, dateKey(horizonDay))

  return {
    todayBalance,
    monthEndBalance,
    lookahead: worst
      ? {
        worstDate: worst.date,
        worstBalance: worst.balance,
        horizonDate: dateKey(horizonDay),
        horizonDays: Math.round((horizonDay.getTime() - today.getTime()) / DAY_MS),
        requestedDays,
        truncated: horizonDay.getTime() < requestedEnd.getTime(),
      }
      : null,
  }
}
