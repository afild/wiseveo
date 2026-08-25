import { prisma } from "@/lib/prisma"
import { getInsightsData } from "@/features/insights/services/get-insights-data"
import { getMonthlyFlows } from "@/features/insights/services/monthly-series"

/**
 * A foto mensal dos indicadores: uma linha por dono de dados e por mês FECHADO.
 *
 * Existe para o boletim dizer "este mês contra a sua média" sem recalcular treze
 * meses de histórico a cada envio. É tirada no primeiro tique de cada mês e
 * guarda o mês anterior — o único que já não muda mais.
 *
 * Só acumula daqui para frente. Reconstruir o passado seria mentira: metade dos
 * indicadores depende do saldo de contas NAQUELE dia, e o saldo de ontem não
 * volta.
 */

export interface KpiSnapshotPayload {
  income: number
  outflow: number
  net: number
  savingsRatePct: number | null
  burnRateMonthly: number
  fixedMonthly: number
  emergencyRunwayMonths: number
  personalRunwayMonths: number | null
  recurringMonthly: number
  overdueCount: number
  overdueAmount: number
}

function isTableMissing(error: unknown): boolean {
  return Boolean(error) && (error as { code?: string }).code === "P2021"
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error) && (error as { code?: string }).code === "P2002"
}

/**
 * Tira a foto do mês `period` ("YYYYMM"). Devolve `true` só quando gravou agora.
 * Tabela ausente ou foto já existente → `false`, sem erro: comparação é um
 * bônus do boletim, nunca um motivo para o tique parar.
 */
export async function captureKpiSnapshot(
  dataOwnerId: string,
  period: string,
  now: Date = new Date(),
): Promise<boolean> {
  let payload: KpiSnapshotPayload
  try {
    const [insights, flows] = await Promise.all([
      getInsightsData(dataOwnerId, now),
      getMonthlyFlows(dataOwnerId, 2, now),
    ])
    const closed = flows.find((flow) => flow.period === period)
    const income = closed?.income ?? 0
    const outflow = closed?.outflow ?? 0

    payload = {
      income,
      outflow,
      net: income - outflow,
      savingsRatePct: insights.savingsRate.avg12mRatePct,
      burnRateMonthly: insights.burnRate.recentMonthly,
      fixedMonthly: insights.fixedCommitment.fixedMonthly,
      emergencyRunwayMonths: insights.emergencyRunway.coverageMonths,
      personalRunwayMonths: insights.personalRunway.runwayMonths,
      recurringMonthly: insights.recurringLoad.monthlyTotal,
      overdueCount: insights.overdueCost.count,
      overdueAmount: insights.overdueCost.totalAmount,
    }
  } catch (error) {
    console.error("[NOTIFICATIONS] KPI snapshot computation failed:", error)
    return false
  }

  try {
    await prisma.kpiSnapshot.create({
      // O campo é JSON no banco; o Prisma pede o tipo aberto dele.
      data: { userId: dataOwnerId, period, payload: { ...payload } },
    })
    return true
  } catch (error) {
    if (isUniqueViolation(error) || isTableMissing(error)) return false
    throw error
  }
}

/** Donos que ainda não têm a foto daquele mês. Uma consulta só, não uma por pessoa. */
export async function findOwnersMissingSnapshot(
  dataOwnerIds: string[],
  period: string,
): Promise<string[]> {
  if (dataOwnerIds.length === 0) return []
  try {
    const existing = await prisma.kpiSnapshot.findMany({
      where: { period, userId: { in: dataOwnerIds } },
      select: { userId: true },
    })
    const done = new Set(existing.map((row) => row.userId))
    return dataOwnerIds.filter((id) => !done.has(id))
  } catch (error) {
    if (isTableMissing(error)) return []
    throw error
  }
}

export interface KpiAverages {
  months: number
  income: number
  outflow: number
  net: number
}

/**
 * Média dos meses fechados já fotografados, ignorando o mês que está sendo
 * comparado. Menos de dois meses guardados → `null`: uma "média" de um mês só
 * não é média, e o boletim prefere não dizer nada a dizer bobagem.
 */
export async function getKpiAverages(
  dataOwnerId: string,
  excludePeriod: string,
  months = 12,
): Promise<KpiAverages | null> {
  try {
    const rows = await prisma.kpiSnapshot.findMany({
      where: { userId: dataOwnerId, period: { not: excludePeriod } },
      orderBy: { period: "desc" },
      take: months,
      select: { payload: true },
    })
    if (rows.length < 2) return null

    const payloads = rows
      .map((row) => row.payload as unknown as Partial<KpiSnapshotPayload> | null)
      .filter((payload): payload is Partial<KpiSnapshotPayload> => Boolean(payload))
    if (payloads.length < 2) return null

    const sum = (pick: (payload: Partial<KpiSnapshotPayload>) => number | null | undefined) =>
      payloads.reduce((total, payload) => total + (Number(pick(payload)) || 0), 0) / payloads.length

    return {
      months: payloads.length,
      income: sum((payload) => payload.income),
      outflow: sum((payload) => payload.outflow),
      net: sum((payload) => payload.net),
    }
  } catch (error) {
    if (isTableMissing(error)) return null
    throw error
  }
}
