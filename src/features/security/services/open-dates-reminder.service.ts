import { createDateFormatter } from "@/i18n/format"
import { prisma } from "@/lib/prisma"
import { localDateKey, type ZonedParts } from "@/features/notifications/lib/schedule"
import type { NotificationContext } from "@/features/notifications/types/notifications.types"
import { addDays } from "../lib/date-closing"
import { canManageClosing, canManagePin, type Actor } from "../lib/permissions"
import { countTransactionsBetween } from "./date-closing.service"
import { readOwnerClosing } from "./read-owner-closing"

/**
 * O aviso de "datas abertas": um cutucão no Telegram para quem passou dias sem
 * fechar nada. Determinístico e barato — nenhuma chamada de IA.
 *
 * DOIS GATILHOS, e um só já basta:
 * (a) existe lançamento com dia depois do corte e até o prazo (é o "tem coisa
 *     esperando fechamento há mais de N dias");
 * (b) o próprio corte está parado há mais de N dias, mesmo sem lançamento
 *     nenhum no meio — o caso de "passei uma semana sem lançar nada", que é
 *     justamente o que motivou o lembrete.
 *
 * SÓ QUEM PODE FECHAR recebe: convidado que não fecha data não tem o que fazer
 * com o aviso, e sessão de vitrine nunca é gente de verdade. Sem nada a dizer,
 * a resposta é null e o tique anota silêncio.
 *
 * E SÓ QUEM PODE RESOLVER: sem PIN o servidor recusa o fechamento (428
 * `pinNotSet`), e quem cria o PIN é o dono dos dados, não o convidado ADMIN que
 * fecha datas. Cobrar esse convidado toda manhã por uma tecla que não é dele
 * seria barulho puro — então nesse caso o aviso cala. Para quem PODE criar o
 * PIN, a mensagem ganha a frase que diz por onde começar.
 */

/** Texto do aviso ou null (silêncio). */
export async function buildOpenDatesReminder(input: {
  actor: Actor
  parts: ZonedParts
  days: number
  ctx: NotificationContext
}): Promise<string | null> {
  if (!canManageClosing(input.actor)) return null

  const closing = await readOwnerClosing(prisma, input.actor.ownerId, null)
  // Sem PIN gravado nada pode ser fechado. Quem não cria o PIN (convidado ADMIN)
  // receberia o mesmo cutucão todo dia sem ter o que fazer: cala aqui, antes até
  // de contar lançamento.
  const needsPin = closing.pinHash === null
  if (needsPin && !canManagePin(input.actor)) return null

  // O dia é o da PESSOA (fuso dela), não o do servidor: a conta de "há N dias"
  // tem de bater com o calendário de quem lê a mensagem.
  const today = localDateKey(input.parts)
  const threshold = addDays(today, -input.days)
  const between = await countTransactionsBetween(input.actor.ownerId, closing.closedThrough, threshold)
  const stale = closing.closedThrough !== null && closing.closedThrough < threshold
  if (between.total === 0 && !stale) return null

  // As chaves de dia são datas de CALENDÁRIO: montadas e lidas em UTC, senão o
  // dia aparece um a menos em qualquer servidor a oeste de Greenwich.
  const fmt = createDateFormatter(input.ctx.locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  })
  const day = (key: string) => fmt.format(new Date(`${key}T00:00:00.000Z`))

  const lines: string[] = []
  if (between.total > 0) {
    // Tudo no mesmo dia ganha frase própria: "entre 20/08/2026 e 20/08/2026" é a
    // mesma data repetida, e não é assim que alguém diria isso em voz alta.
    lines.push(
      between.firstDate === between.lastDate
        ? input.ctx.t("openDates.pendingSameDay", {
            count: between.total,
            date: day(between.firstDate!),
          })
        : input.ctx.t("openDates.pending", {
            count: between.total,
            from: day(between.firstDate!),
            to: day(between.lastDate!),
          }),
    )
  } else {
    lines.push(input.ctx.t("openDates.stale", { date: day(closing.closedThrough!) }))
  }
  // Não pago é onde o fechamento vai travar: dizer isso junto evita a pessoa
  // tentar fechar e levar o 409 de bloqueadores sem entender por quê. Vem colado
  // na frase de cima porque o "deles" se refere aos lançamentos dela.
  if (between.unpaid > 0) lines.push(input.ctx.t("openDates.unpaid", { unpaid: between.unpaid }))
  // Por último: é o primeiro passo em ordem de execução, mas a última coisa a
  // dizer — a frase de cima é o motivo do aviso.
  if (needsPin) lines.push(input.ctx.t("openDates.noPin"))

  return lines.join(" ")
}
