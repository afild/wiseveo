import { prisma } from "@/lib/prisma"
import { getAccountsWithBalance } from "@/features/accounts/services/get-accounts"
import { getDailyStatement } from "@/features/shared/services/get-daily-statement"
import {
  dateKey,
  periodKeyOf,
  pickWorstAhead,
  resolveHorizon,
  resolveLaunchedThrough,
  resolveRadarRange,
  type BalancePoint,
  type PeriodCount,
} from "../lib/radar-window"

const DAY_MS = 24 * 60 * 60 * 1000
/**
 * Meses de histórico puxados para a densidade. `BASELINE_MONTHS` exige três meses fechados
 * PRESENTES nos dados, e puxar exatos três não deixa folga: um único mês sem lançamento nenhum
 * derruba a base e o corte por densidade some. Seis custa o mesmo e sobrevive a um buraco,
 * porque `resolveLaunchedThrough` continua pegando só os três mais recentes.
 */
const DENSITY_MONTHS_BACK = 6
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
  /**
   * Na prática nunca são `null`: a janela sempre contém hoje e o fim do mês, e o horizonte
   * nunca fica antes de hoje, então há sempre ao menos um ponto na varredura. O `null` é
   * cortesia de tipo para o consumidor não precisar de asserção, não um estado que aparece.
   */
  todayBalance: number | null
  monthEndBalance: number | null
  lookahead: RadarLookahead | null
}

/**
 * Retrato do radar: saldo de hoje, saldo do fim do mês, menor saldo à frente e até onde deu
 * para olhar. Toda a aritmética de janela e horizonte vive em `radar-window.ts`, que tem suíte;
 * aqui fica só a ida ao banco e a montagem da linha de saldo.
 */
export async function getRadarSnapshot(
  userId: string,
  requestedDays: number,
  now: Date,
): Promise<RadarSnapshot> {
  const range = resolveRadarRange(now, requestedDays)

  const densityFrom = new Date(
    Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth() - DENSITY_MONTHS_BACK, 1),
  )
  const densityTo = new Date(
    Date.UTC(
      range.from.getUTCFullYear(),
      range.from.getUTCMonth() + DENSITY_MONTHS_AHEAD,
      0,
      23,
      59,
      59,
      999,
    ),
  )

  const [statement, openingBalances, densityRows] = await Promise.all([
    getDailyStatement(userId, range.from, range.to),
    // Mesma semente da rota de fluxo de caixa, para os dois números baterem na tela.
    getAccountsWithBalance(userId, new Date(range.from.getTime() - 1)),
    // Contagem por mês da DATA, não do campo `period`. Os dois eixos divergem de propósito
    // neste sistema: as parcelas de uma compra recebem todas a mesma competência, com datas
    // espalhadas por meses. Agrupar por `period` encheria o mês corrente e esvaziaria os
    // seguintes, encurtando o horizonte sem motivo. A linha de saldo anda por data, então a
    // catraca tem que andar por data também.
    prisma.transaction.findMany({
      where: { userId, date: { gte: densityFrom, lte: densityTo } },
      select: { date: true },
    }),
  ])

  const countByMonth = new Map<string, number>()
  for (const row of densityRows) {
    const key = periodKeyOf(row.date)
    countByMonth.set(key, (countByMonth.get(key) ?? 0) + 1)
  }
  const counts: PeriodCount[] = Array.from(countByMonth, ([period, count]) => ({ period, count }))

  const byDay = new Map(statement.map((entry) => [entry.date, entry]))
  // Reacumula a partir da semente do fluxo de caixa em vez de usar o `accumulated` que o extrato
  // já traz. Dois motivos: as duas aberturas dão números DIFERENTES (a do extrato inclui o
  // histórico das contas desativadas, a da semente não), e usar a do extrato faria a barra
  // lateral discordar do gráfico; e o extrato só emite dias COM movimento, então num dia parado
  // o `accumulated` simplesmente não existe, e hoje pode ser um dia parado.
  let runningBalance = openingBalances.reduce(
    (sum, account) => sum + account.currentBalance,
    0,
  )

  const points: BalancePoint[] = []
  for (
    let cursor = range.from;
    cursor.getTime() <= range.lastDay.getTime();
    cursor = new Date(cursor.getTime() + DAY_MS)
  ) {
    const key = dateKey(cursor)
    runningBalance += byDay.get(key)?.net ?? 0
    points.push({ date: key, balance: runningBalance })
  }

  const balanceByDate = new Map(points.map((point) => [point.date, point.balance]))
  // `??` e não `||`: um saldo de exatamente zero é um valor, não ausência de valor.
  const todayBalance = balanceByDate.get(dateKey(range.today)) ?? null
  const monthEndBalance = balanceByDate.get(dateKey(range.monthEnd)) ?? null

  const launched = resolveLaunchedThrough(counts, periodKeyOf(range.today))
  const horizon = resolveHorizon(launched, range.today, range.requestedEnd)
  const worst = pickWorstAhead(points, dateKey(range.today), dateKey(horizon.horizonDay))

  return {
    todayBalance,
    monthEndBalance,
    lookahead: worst
      ? {
        worstDate: worst.date,
        worstBalance: worst.balance,
        horizonDate: dateKey(horizon.horizonDay),
        horizonDays: horizon.horizonDays,
        requestedDays,
        truncated: horizon.truncated,
      }
      : null,
  }
}
