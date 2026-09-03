import { getTranslations } from "next-intl/server"
import { prisma } from "@/lib/prisma"
import { resolveDataOwnerId } from "@/lib/data-owner"
import { createMonetaryFormatter, resolveMonetarySettings } from "@/lib/monetary"
import { resolveLocaleOrInstallDefault } from "@/i18n/install-locale"
import { describeTelegramError } from "@/features/telegram/services/bot.service"
import type { TelegramChatId } from "@/features/telegram/types/telegram.types"
import {
  hasAnyNotificationEnabled,
  resolveNotificationPreferences,
  type NotificationKind,
  type NotificationPreferences,
} from "../lib/preferences"
import { getZonedParts, listDueJobs, previousPeriod, type ZonedParts } from "../lib/schedule"
import type { NotificationContext } from "../types/notifications.types"
import {
  claimDelivery,
  getLastDeliveryDetail,
  markDelivered,
  markFailed,
  markSkipped,
  pruneDeliveries,
  releaseDelivery,
} from "./delivery-ledger.service"
import { buildBulletin, type BulletinKind } from "./bulletin.service"
import { buildSentinel, formatSentinelMessage } from "./sentinel.service"
import { buildBillsReminder, formatBillsReminderMessage } from "./bills-reminder.service"
import { buildOpenDatesReminder } from "@/features/security/services/open-dates-reminder.service"
import { captureKpiSnapshot, findOwnersMissingSnapshot } from "./kpi-snapshot.service"
import { sendTextNotification } from "./notification-channel.service"
import { sendComposedBlocks } from "@/features/telegram/services/block-sender.service"
import type { ResponseBlock } from "@/features/ai/types/response.types"
import { getUserCardTheme } from "@/features/settings/services/user-settings-service"
import type { CardThemeMode } from "@/features/telegram/cards/card-theme"

/**
 * O tique: o que roda a cada batida do despertador externo.
 *
 * Monta a fila de "quem recebe o quê agora" (fuso e horário de cada pessoa),
 * reserva cada ocorrência no caderno de envios e só então constrói e manda. Nada
 * aqui confia no relógio para não repetir — a reserva é que garante isso.
 *
 * DUAS ETAPAS SEPARADAS, e essa fronteira é o coração do desenho: MONTAR (ler o
 * banco, chamar a IA, desenhar o card) ainda não mandou nada, então falha ali
 * desfaz a reserva e a próxima batida tenta de novo; ENVIAR já acionou o canal,
 * e falha dali em diante fica marcada e NÃO é repetida.
 *
 * TETO POR BATIDA: uma execução em hospedagem serverless morre no minuto. Se a
 * fila for maior que o teto, o excesso fica para a batida seguinte (a janela de
 * tolerância do horário cobre a espera) e o número de adiados vai no relatório —
 * fila truncada em silêncio pareceria "tudo entregue". Ocorrência já entregue
 * não consome o teto: a fila anda sozinha nas batidas seguintes.
 */

/**
 * Quantos avisos uma batida constrói. Era 6, dimensionado para o boletim antigo
 * — cinco números e uma frase. Hoje cada boletim faz cinco consultas ao banco,
 * uma composição no modelo forte com até 4000 tokens de saída, o desenho de um
 * PNG e o envio: seis desses não cabem no minuto que a hospedagem dá.
 *
 * O teto de TEMPO abaixo é a proteção que importa; este número só evita começar
 * uma fila que já se sabe grande demais.
 */
const MAX_JOBS_PER_TICK = 3
/**
 * A partir daqui a batida não COMEÇA outro aviso.
 *
 * Sem isto, a função era morta no meio de um envio: a reserva ficava presa, a
 * retomada por idade a reassumia meia hora depois e o boletim saía de novo —
 * pagando a IA duas vezes e, no pior caso, chegando repetido. Terminar o que
 * começou e deixar o resto para a próxima batida (a janela de tolerância é de
 * 90 minutos) é o comportamento certo.
 */
const TICK_TIME_BUDGET_MS = 40_000
const MAX_SNAPSHOTS_PER_TICK = 2
/** A foto do mês anterior só é tirada no começo do mês; fora disso, nem se procura. */
const SNAPSHOT_WINDOW_DAYS = 3
/**
 * Por quantos dias a sentinela considera "o mesmo quadro de antes". Passado
 * isso, um problema que persiste volta a ser dito — silêncio eterno sobre conta
 * vencida seria pior que a repetição que estamos evitando.
 */
const SENTINEL_MEMORY_DAYS = 7

export interface TickResult {
  /** Pessoas com o Telegram ligado e algum aviso ativado. */
  candidates: number
  sent: number
  skipped: number
  failed: number
  /** Ficaram para a próxima batida por causa do teto. */
  deferred: number
  snapshots: number
}

interface QueuedJob {
  userId: string
  chatId: TelegramChatId
  kind: NotificationKind
  occurrenceKey: string
  preferences: NotificationPreferences
  parts: ZonedParts
  /** Preferências completas da pessoa, já lidas na consulta da fila. */
  rawPreferences: Record<string, unknown>
  /** Primeiro nome de quem recebe — o boletim fala com uma pessoa. */
  audience: string
  /** Papel e situação de quem recebe: o aviso de datas abertas só vai a quem pode fechar. */
  role: string
  status: string
}

/** Pronto para sair: nada aqui depende mais de banco, de IA nem de desenho. */
type BuiltNotification =
  | { send: "blocks"; blocks: ResponseBlock[]; detail?: string }
  | { send: "text"; text: string; detail?: string }
  | { send: "nothing"; reason: string }

/**
 * Idioma e moeda saem das preferências que a consulta da fila JÁ trouxe — fora
 * de uma requisição não existe cookie, e reler `users` duas vezes por aviso só
 * gastaria consulta para chegar ao mesmo lugar.
 */
async function buildContext(rawPreferences: Record<string, unknown>): Promise<NotificationContext> {
  const locale = resolveLocaleOrInstallDefault(rawPreferences.locale)
  const [t, cardT] = await Promise.all([
    getTranslations({ locale, namespace: "notifications" }),
    getTranslations({ locale, namespace: "telegram" }),
  ])
  return {
    locale,
    t,
    cardT,
    monetary: createMonetaryFormatter(
      resolveMonetarySettings(
        (rawPreferences.monetary as Record<string, unknown> | undefined) ?? null,
      ),
    ),
  }
}

async function buildBulletinJob(
  job: QueuedJob,
  dataOwnerId: string,
  ctx: NotificationContext,
  audience: string,
): Promise<BuiltNotification> {
  const blocks = await buildBulletin({
    dataOwnerId,
    kind: job.kind as BulletinKind,
    parts: job.parts,
    ctx,
    audience,
  })
  return { send: "blocks", blocks }
}

async function buildSentinelJob(
  job: QueuedJob,
  dataOwnerId: string,
  ctx: NotificationContext,
  now: Date,
): Promise<BuiltNotification> {
  const sentinel = await buildSentinel({ dataOwnerId, ctx, now })
  if (sentinel.lines.length === 0) {
    return { send: "nothing", reason: "quiet" }
  }

  // Mesmo quadro de dias atrás = silêncio. O detector de gasto atípico compara o
  // MÊS corrente, então um alerta legítimo ficaria repetindo até o mês virar.
  const previous = await getLastDeliveryDetail(job.userId, "sentinel", SENTINEL_MEMORY_DAYS, now)
  if (previous && previous === sentinel.signature) {
    return { send: "nothing", reason: "unchanged" }
  }

  return {
    send: "text",
    text: formatSentinelMessage(sentinel, ctx),
    detail: sentinel.signature,
  }
}

async function buildBillsJob(
  job: QueuedJob,
  dataOwnerId: string,
  ctx: NotificationContext,
): Promise<BuiltNotification> {
  const reminder = await buildBillsReminder({
    dataOwnerId,
    parts: job.parts,
    daysAhead: job.preferences.billsReminder.daysAhead,
    ctx,
  })
  if (reminder.count === 0) {
    return { send: "nothing", reason: "quiet" }
  }

  return {
    send: "text",
    text: formatBillsReminderMessage(reminder, job.preferences.billsReminder.daysAhead, ctx),
  }
}

/**
 * O aviso de datas abertas. O ator é montado AQUI, com `showcase: false` — um
 * despertador nunca é sessão de vitrine — e com o dono já resolvido, para que a
 * regra de quem-pode-fechar seja exatamente a mesma das telas e das rotas.
 */
async function buildOpenDatesJob(
  job: QueuedJob,
  dataOwnerId: string,
  ctx: NotificationContext,
): Promise<BuiltNotification> {
  const text = await buildOpenDatesReminder({
    actor: {
      actorUserId: job.userId,
      ownerId: dataOwnerId,
      role: job.role,
      status: job.status,
      showcase: false,
    },
    parts: job.parts,
    days: job.preferences.openDatesReminder.days,
    ctx,
  })
  if (text === null) return { send: "nothing", reason: "quiet" }
  return { send: "text", text }
}

/**
 * Um aviso, do começo ao fim. A reserva já foi feita pelo chamador; aqui se
 * decide entre confirmar, anotar silêncio, devolver a reserva ou anotar falha.
 */
async function runJob(job: QueuedJob, now: Date): Promise<"sent" | "skipped" | "failed"> {
  const ref = { userId: job.userId, kind: job.kind, occurrenceKey: job.occurrenceKey }

  let built: BuiltNotification
  try {
    const [ctx, dataOwnerId] = await Promise.all([
      buildContext(job.rawPreferences),
      resolveDataOwnerId(job.userId),
    ])

    built =
      job.kind === "sentinel"
        ? await buildSentinelJob(job, dataOwnerId, ctx, now)
        : job.kind === "billsReminder"
          ? await buildBillsJob(job, dataOwnerId, ctx)
          : job.kind === "openDatesReminder"
            ? await buildOpenDatesJob(job, dataOwnerId, ctx)
            : await buildBulletinJob(job, dataOwnerId, ctx, job.audience)

    if (built.send === "nothing") {
      await markSkipped(ref, built.reason)
      return "skipped"
    }
  } catch (error) {
    // NADA saiu: um piscar do banco, a imagem que não desenhou. Devolver a
    // reserva é o que permite a batida seguinte tentar de novo — sem isto, o
    // boletim mensal perderia o mês inteiro por causa de uma consulta que caiu.
    await releaseDelivery(ref)
    console.error(`[NOTIFICATIONS] ${job.kind} build failed:`, describeTelegramError(error))
    return "failed"
  }

  try {
    if (built.send === "blocks") {
      // O tema é da PESSOA e ela troca por mensagem no Telegram; ler aqui, na
      // hora de desenhar, é o que faz a escolha valer também nos boletins.
      const mode: CardThemeMode = await getUserCardTheme(job.userId).catch(() => "dark")
      await sendComposedBlocks({
        chatId: job.chatId,
        blocks: built.blocks,
        audience: job.audience,
        mode,
      })
    } else {
      await sendTextNotification(job.chatId, built.text)
    }
    await markDelivered(ref, built.detail)
    return "sent"
  } catch (error) {
    // Daqui em diante o canal JÁ foi acionado: pode ter saído a foto e falhado a
    // segunda mensagem. A linha fica marcada e não se tenta de novo — um boletim
    // perdido incomoda menos que o mesmo boletim duas vezes.
    const detail = describeTelegramError(error)
    await markFailed(ref, detail)
    console.error(`[NOTIFICATIONS] ${job.kind} send failed:`, detail)
    return "failed"
  }
}

/**
 * A foto mensal dos indicadores, uma vez por dono de dados e por mês.
 *
 * Só nos primeiros dias do mês e, dentro deles, uma vez por hora: é o trabalho
 * mais caro do tique (~19 consultas por dono) e, se o cálculo estiver falhando,
 * repetir a cada quinze minutos por três dias seria bater na mesma porta 288
 * vezes.
 */
function isSnapshotWindow(now: Date): boolean {
  return now.getUTCDate() <= SNAPSHOT_WINDOW_DAYS && now.getUTCMinutes() < 15
}

async function runSnapshots(dataOwnerIds: string[], now: Date): Promise<number> {
  const period = previousPeriod(now.getUTCFullYear(), now.getUTCMonth() + 1)
  const missing = await findOwnersMissingSnapshot(dataOwnerIds, period)
  let taken = 0

  for (const ownerId of missing.slice(0, MAX_SNAPSHOTS_PER_TICK)) {
    if (await captureKpiSnapshot(ownerId, period, now)) taken += 1
  }

  return taken
}

export async function runNotificationTick(now: Date = new Date()): Promise<TickResult> {
  const connections = await prisma.telegramConnection.findMany({
    where: { isActive: true, user: { status: "ACTIVE" } },
    select: {
      userId: true,
      telegramChatId: true,
      user: { select: { preferencesJson: true, name: true, role: true, status: true } },
    },
    orderBy: { userId: "asc" },
  })

  const queue: QueuedJob[] = []
  const enabledUserIds = new Set<string>()

  for (const connection of connections) {
    const rawPreferences =
      (connection.user.preferencesJson as Record<string, unknown> | null) ?? {}
    const preferences = resolveNotificationPreferences(rawPreferences.notifications)
    if (!hasAnyNotificationEnabled(preferences)) continue
    enabledUserIds.add(connection.userId)

    const parts = getZonedParts(now, preferences.timezone)
    const audience = connection.user.name.trim().split(/\s+/)[0] ?? ""
    for (const job of listDueJobs(preferences, now)) {
      queue.push({
        userId: connection.userId,
        audience,
        role: connection.user.role,
        status: connection.user.status,
        // O chat vem como BigInt do banco; a API do Telegram aceita o número em texto.
        chatId: connection.telegramChatId.toString(),
        kind: job.kind,
        occurrenceKey: job.occurrenceKey,
        preferences,
        parts,
        rawPreferences,
      })
    }
  }

  const result: TickResult = {
    candidates: enabledUserIds.size,
    sent: 0,
    skipped: 0,
    failed: 0,
    deferred: 0,
    snapshots: 0,
  }

  // Ordem estável: a mesma fila truncada duas vezes tem de começar pelos mesmos
  // itens, senão o teto viraria uma loteria em que alguém nunca é atendido.
  queue.sort((a, b) => a.userId.localeCompare(b.userId) || a.kind.localeCompare(b.kind))

  const startedAt = now.getTime()
  for (const job of queue) {
    const done = result.sent + result.skipped + result.failed
    const outOfTime = Date.now() - startedAt >= TICK_TIME_BUDGET_MS
    if (done >= MAX_JOBS_PER_TICK || outOfTime) {
      result.deferred += 1
      continue
    }

    const claimed = await claimDelivery(
      { userId: job.userId, kind: job.kind, occurrenceKey: job.occurrenceKey },
      now,
    )
    if (!claimed) continue

    const outcome = await runJob(job, now)
    result[outcome] += 1
  }

  // Só depois de a fila andar: as fotos são o trabalho mais caro do tique e não
  // podem consumir o tempo que os avisos da vez precisam.
  if (enabledUserIds.size > 0 && isSnapshotWindow(now)) {
    const owners = await Promise.all([...enabledUserIds].map((userId) => resolveDataOwnerId(userId)))
    result.snapshots = await runSnapshots([...new Set(owners)], now)
  }

  // Faxina uma vez por dia: apagar por data não usa índice nenhum, e o caderno
  // não cresce rápido o bastante para justificar isso a cada quinze minutos.
  if (now.getUTCHours() === 4 && now.getUTCMinutes() < 15) await pruneDeliveries(now)

  return result
}
