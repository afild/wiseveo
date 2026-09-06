/**
 * Matemática pura do radar: nada de banco, nada de React. O Vitest deste projeto só coleta
 * arquivos de teste dentro de `tests/`, em ambiente node, então tudo que precisa ser provado
 * mora aqui e os componentes ficam finos.
 */

/** Um dia da linha de saldo acumulado. `date` no formato "AAAA-MM-DD" (UTC). */
export interface BalancePoint {
  date: string
  balance: number
}

/** Contagem de lançamentos de um mês. `period` no formato "AAAAMM" (Transaction.PERIODO). */
export interface PeriodCount {
  period: string
  count: number
}

/** Quantos meses fechados formam a linha de base da densidade. */
export const BASELINE_MONTHS = 3
/** Fração da mediana a partir da qual um mês futuro conta como lançado. */
export const LAUNCHED_RATIO = 0.4
/** Trava do passo para frente: 24 meses cobre qualquer janela aceita (máx. 365 dias). */
const MAX_MONTHS_AHEAD = 24

export function nextPeriod(period: string): string {
  const year = Number(period.slice(0, 4))
  const month = Number(period.slice(4, 6))
  if (month === 12) return `${year + 1}01`
  return `${year}${String(month + 1).padStart(2, "0")}`
}

/** Último dia do mês do período, à meia-noite UTC. */
export function endOfPeriodUtc(period: string): Date {
  const year = Number(period.slice(0, 4))
  const month = Number(period.slice(4, 6))
  // Dia 0 do mês seguinte é o último dia deste.
  return new Date(Date.UTC(year, month, 0))
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

/**
 * Menor saldo entre hoje e o horizonte, os dois inclusive. Empate fica com o dia mais próximo:
 * o vale que chega antes é o que dá menos tempo de reagir.
 */
export function pickWorstAhead(
  points: BalancePoint[],
  todayKey: string,
  horizonKey: string,
): BalancePoint | null {
  let worst: BalancePoint | null = null
  for (const point of points) {
    if (point.date < todayKey || point.date > horizonKey) continue
    if (worst === null || point.balance < worst.balance) worst = point
  }
  return worst
}

export type LaunchedThrough =
  /** Sem histórico suficiente para julgar densidade: não corta nada. */
  | { kind: "no-baseline" }
  /** O próprio mês corrente está vazio: o radar não enxerga nada à frente. */
  | { kind: "current-month-empty" }
  /** Lançado até o fim deste período, inclusive. */
  | { kind: "launched"; through: string }

/**
 * Até onde os lançamentos do dono realmente vão.
 *
 * A linha de base é a mediana dos três meses fechados mais recentes. Um mês do presente para
 * frente conta como lançado quando tem ao menos 40% dessa base. Uma parcela solta lá na frente
 * não engana o teste: 6 lançamentos contra uma base de 90 não chegam perto.
 *
 * Mediana e não média porque um mês atípico (mudança, viagem, décimo terceiro) puxaria a média
 * e reprovaria meses normais.
 */
export function resolveLaunchedThrough(
  counts: PeriodCount[],
  todayPeriod: string,
): LaunchedThrough {
  const byPeriod = new Map(counts.map((entry) => [entry.period, entry.count]))

  const closed = counts
    .filter((entry) => entry.period < todayPeriod)
    .sort((a, b) => (a.period < b.period ? 1 : -1))
    .slice(0, BASELINE_MONTHS)

  if (closed.length < BASELINE_MONTHS) return { kind: "no-baseline" }

  const baseline = median(closed.map((entry) => entry.count))
  if (baseline <= 0) return { kind: "no-baseline" }

  const floor = baseline * LAUNCHED_RATIO
  let launched: string | null = null
  let cursor = todayPeriod

  for (let step = 0; step <= MAX_MONTHS_AHEAD; step++) {
    if ((byPeriod.get(cursor) ?? 0) < floor) break
    launched = cursor
    cursor = nextPeriod(cursor)
  }

  if (launched === null) return { kind: "current-month-empty" }
  return { kind: "launched", through: launched }
}
