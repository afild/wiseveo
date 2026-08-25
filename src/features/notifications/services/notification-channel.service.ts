import {
  sendTelegramMessage,
  sendTelegramPhoto,
} from "@/features/telegram/services/bot.service"
import { generateCardImage } from "@/features/telegram/services/card-renderer.service"
import type { CardData, TelegramChatId } from "@/features/telegram/types/telegram.types"
import type { NotificationContext } from "../types/notifications.types"

/**
 * Por onde o aviso sai. Hoje só existe o Telegram; o WhatsApp entra aqui adiante
 * sem que nenhum construtor de conteúdo saiba disso — canal e motor são coisas
 * separadas desde a Etapa 2.
 *
 * Desenhar a imagem é uma etapa À PARTE do envio, de propósito: até o desenho,
 * nada saiu, e uma falha ali pode ser tentada de novo na batida seguinte. Do
 * primeiro envio em diante, não pode.
 *
 * Os dois limites do Telegram estão embutidos porque estourá-los devolve erro e
 * a mensagem simplesmente não chega: legenda de foto vai até 1024 caracteres e
 * mensagem de texto até 4096.
 */

const CAPTION_LIMIT = 1024
const MESSAGE_LIMIT = 4096

function clamp(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`
}

/** Desenha o card. Ainda NÃO envia nada. */
export function renderNotificationCard(card: CardData, ctx: NotificationContext): Promise<Buffer> {
  return generateCardImage(card, ctx.cardT)
}

/**
 * Card + análise. A análise vai como legenda quando cabe; quando não cabe, vira
 * uma segunda mensagem — cortar a conclusão do boletim seria pior do que enviar
 * duas mensagens.
 */
export async function sendCardNotification(input: {
  chatId: TelegramChatId
  image: Buffer
  text: string | null
}): Promise<void> {
  const text = input.text?.trim() || null
  const caption = text && text.length <= CAPTION_LIMIT ? text : undefined

  await sendTelegramPhoto(input.chatId, input.image, caption)

  if (text && !caption) {
    await sendTelegramMessage(input.chatId, clamp(text, MESSAGE_LIMIT))
  }
}

export async function sendTextNotification(chatId: TelegramChatId, text: string): Promise<void> {
  await sendTelegramMessage(chatId, clamp(text, MESSAGE_LIMIT))
}
