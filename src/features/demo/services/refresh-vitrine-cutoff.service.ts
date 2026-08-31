import { prisma } from "@/lib/prisma"
import { endOfUTCDay } from "@/lib/financial"
import { getVitrineUserId } from "./vitrine.service"

const DIA_MS = 86_400_000
// Mesmos números de materialize.ts (vitrine de cobrança: 2 despesas ≤ 300 nos
// 5 dias antes do corte). Se materialize mudar, mude AQUI junto.
const OVERDUE_MAX = 300
const OVERDUE_JANELA_MS = 5 * DIA_MS
const OVERDUE_QTD = 2

type TxLeve = { id: string; date: Date; amount: number; type: string }

/** Regra pura e testável: decide o status de cada lançamento da vitrine em
 *  relação a `now` — espelho de materialize.ts, para a vitrine não envelhecer. */
export function planVitrineStatuses(txs: TxLeve[], now: Date) {
  const corte = endOfUTCDay(new Date(now.getTime() - DIA_MS))
  const vencidas = txs
    .filter(
      (t) =>
        t.type === "EXPENSE" &&
        Math.abs(t.amount) <= OVERDUE_MAX &&
        t.date <= corte &&
        corte.getTime() - t.date.getTime() <= OVERDUE_JANELA_MS,
    )
    .sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount))
    .slice(0, OVERDUE_QTD)
  const overdueIds = vencidas.map((t) => t.id)
  const overdue = new Set(overdueIds)
  return {
    overdueIds,
    paidIds: txs.filter((t) => t.date <= corte && !overdue.has(t.id)).map((t) => t.id),
    pendingIds: txs.filter((t) => t.date > corte).map((t) => t.id),
  }
}

/**
 * Uma vez por dia (pega carona na faxina de 15 em 15 min): reposiciona o corte
 * pago/pendente da vitrine. Idempotente; a marca do dia fica em app_settings.
 * Devolve true quando rodou de verdade.
 */
export async function refreshVitrineCutoffIfDue(now = new Date()): Promise<boolean> {
  const vitrineId = await getVitrineUserId()
  if (!vitrineId) return false
  const dia = now.toISOString().slice(0, 10)
  const marca = await prisma.appSetting
    .findUnique({ where: { key: "demo.vitrineCutoffDay" } })
    .catch(() => null)
  if (marca?.value === dia) return false

  // `amount` é Float no schema (VALOR) — já chega como number do Prisma, sem
  // Decimal envolvido; `type` (TransactionType) é um union de string, compatível
  // estruturalmente com TxLeve. Nenhuma conversão extra é necessária.
  const txs = await prisma.transaction.findMany({
    where: { userId: vitrineId },
    select: { id: true, date: true, amount: true, type: true },
    // Ordem cronológica estável (num = i+1 do materializador): empate de |valor|
    // escolhe sempre o mesmo par de vencidas, como no materialize.
    orderBy: { num: "asc" },
  })
  const plano = planVitrineStatuses(txs, now)

  await prisma.$transaction(async (tx) => {
    // Licença de sessão para os gatilhos da vitrine (Tarefa 8): sem isto, o
    // banco recusa a escrita nas linhas dela. Inócuo enquanto os gatilhos não
    // existem.
    // i18n-ignore: comando SQL (não é texto de UI)
    await tx.$executeRaw`SELECT set_config('wiseveo.vitrine_write', 'on', true)`
    await tx.transaction.updateMany({ where: { id: { in: plano.paidIds } }, data: { statusCode: 1 } })
    await tx.transaction.updateMany({ where: { id: { in: plano.pendingIds } }, data: { statusCode: 2 } })
    await tx.transaction.updateMany({ where: { id: { in: plano.overdueIds } }, data: { statusCode: 3 } })
    await tx.appSetting.upsert({
      where: { key: "demo.vitrineCutoffDay" },
      update: { value: dia },
      create: { key: "demo.vitrineCutoffDay", value: dia },
    })
  })
  return true
}
