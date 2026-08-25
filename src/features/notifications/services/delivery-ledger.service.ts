import { prisma } from "@/lib/prisma"
import type { NotificationKind } from "../lib/preferences"

/**
 * O caderno do que já saiu. É ele — e não o horário — que garante "uma vez só".
 *
 * A chave única (usuário, tipo, ocorrência) mora no banco: duas batidas do
 * despertador ao mesmo tempo tentam gravar a mesma linha e o Postgres deixa
 * passar só uma. Quem perde a corrida não envia nada.
 *
 * Regra de falha, deliberadamente conservadora: se algo quebra ANTES do envio,
 * a reserva é desfeita e a próxima batida tenta de novo; se quebra DEPOIS de o
 * canal ter sido acionado, a linha fica marcada como falha e NÃO se tenta de
 * novo — um boletim perdido incomoda menos que o mesmo boletim duas vezes.
 */

export class NotificationLedgerMissingError extends Error {
  constructor() {
    // i18n-ignore: erro interno de servidor, nunca renderizado em UI
    super("notification_deliveries table is missing")
    this.name = "NotificationLedgerMissingError"
  }
}

function isTableMissing(error: unknown): boolean {
  return Boolean(error) && (error as { code?: string }).code === "P2021"
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error) && (error as { code?: string }).code === "P2002"
}

export interface DeliveryRef {
  userId: string
  kind: NotificationKind | string
  occurrenceKey: string
}

/**
 * Reserva parada há tanto tempo que só pode ser lixo: a função morreu no meio
 * (estouro de tempo da hospedagem) sem confirmar nem soltar. Uma batida dura
 * segundos, então meia hora é folga com sobra.
 */
const STALE_CLAIM_MINUTES = 30

/**
 * Reserva a ocorrência. `true` = reservada agora (pode seguir e enviar);
 * `false` = alguém já reservou (não envie nada).
 */
export async function claimDelivery(ref: DeliveryRef, now: Date = new Date()): Promise<boolean> {
  try {
    await prisma.notificationDelivery.create({
      data: {
        userId: ref.userId,
        kind: ref.kind,
        occurrenceKey: ref.occurrenceKey,
        status: "claimed",
      },
    })
    return true
  } catch (error) {
    if (isUniqueViolation(error)) return takeOverStaleClaim(ref, now)
    if (isTableMissing(error)) throw new NotificationLedgerMissingError()
    throw error
  }
}

/**
 * A linha já existe. Se ela ficou presa em "reservada" (ninguém confirmou nem
 * soltou), a batida atual assume — senão um estouro de tempo enterraria aquele
 * aviso para sempre. Linha confirmada, pulada ou com falha NÃO é reassumida.
 *
 * O `UPDATE ... WHERE status = 'claimed' AND created_at < corte` é a própria
 * trava: duas batidas simultâneas disputam a MESMA linha, o Postgres serializa,
 * e a segunda reavalia a condição e não encontra mais nada para atualizar.
 */
async function takeOverStaleClaim(ref: DeliveryRef, now: Date): Promise<boolean> {
  const cutoff = new Date(now.getTime() - STALE_CLAIM_MINUTES * 60 * 1000)
  const result = await prisma.notificationDelivery.updateMany({
    where: {
      userId: ref.userId,
      kind: ref.kind,
      occurrenceKey: ref.occurrenceKey,
      status: "claimed",
      createdAt: { lt: cutoff },
    },
    data: { status: "claimed", createdAt: now, detail: null },
  })
  return result.count === 1
}

async function updateStatus(ref: DeliveryRef, status: string, detail?: string): Promise<void> {
  try {
    await prisma.notificationDelivery.update({
      where: {
        userId_kind_occurrenceKey: {
          userId: ref.userId,
          kind: ref.kind,
          occurrenceKey: ref.occurrenceKey,
        },
      },
      data: { status, detail: detail?.slice(0, 500) ?? null },
    })
  } catch {
    // O caderno é registro, não é o envio. Se a anotação falhar, a mensagem já
    // foi (ou não foi) — derrubar o tique por causa disso pararia a fila inteira.
  }
}

/** `detail` guarda a assinatura do que foi enviado (a sentinela depende dela). */
export function markDelivered(ref: DeliveryRef, detail?: string): Promise<void> {
  return updateStatus(ref, "sent", detail)
}

export function markSkipped(ref: DeliveryRef, reason: string): Promise<void> {
  return updateStatus(ref, "skipped", reason)
}

export function markFailed(ref: DeliveryRef, detail: string): Promise<void> {
  return updateStatus(ref, "failed", detail)
}

/** Desfaz a reserva — só quando NADA foi enviado, para a próxima batida tentar. */
export async function releaseDelivery(ref: DeliveryRef): Promise<void> {
  try {
    await prisma.notificationDelivery.delete({
      where: {
        userId_kind_occurrenceKey: {
          userId: ref.userId,
          kind: ref.kind,
          occurrenceKey: ref.occurrenceKey,
        },
      },
    })
  } catch {
    // Já não existe: nada a desfazer.
  }
}

/**
 * A anotação do último aviso ENVIADO daquele tipo, dentro de uma janela recente.
 *
 * A sentinela usa isto para não repetir o mesmo alerta todo dia: os detectores
 * comparam o mês corrente com o histórico, então um gasto atípico continua
 * atípico até o mês virar.
 *
 * A JANELA é essencial. Sem ela, a comparação seria com o último envio de
 * QUALQUER data: um problema que apareceu, sumiu e voltou semanas depois com o
 * mesmo retrato ficaria em silêncio, e a pessoa nunca saberia das contas
 * vencidas de novo.
 */
export async function getLastDeliveryDetail(
  userId: string,
  kind: NotificationKind | string,
  withinDays: number,
  now: Date = new Date(),
): Promise<string | null> {
  try {
    const last = await prisma.notificationDelivery.findFirst({
      where: {
        userId,
        kind,
        status: "sent",
        createdAt: { gte: new Date(now.getTime() - withinDays * 24 * 60 * 60 * 1000) },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { detail: true },
    })
    return last?.detail ?? null
  } catch (error) {
    if (isTableMissing(error)) return null
    throw error
  }
}

const RETENTION_DAYS = 120

/** Limpeza do histórico antigo — o caderno só precisa lembrar do passado recente. */
export async function pruneDeliveries(now: Date = new Date()): Promise<void> {
  try {
    await prisma.notificationDelivery.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000) } },
    })
  } catch {
    // Limpeza é conveniência; falhar aqui não pode derrubar o tique.
  }
}
