import { sendTelegramMessage } from "@/features/telegram/services/bot.service"
import type { TelegramChatId } from "@/features/telegram/types/telegram.types"

/**
 * O aviso de TEXTO PURO — sentinela e lembrete de contas, que são
 * determinísticos e não passam pela IA.
 *
 * O que a IA compõe (os boletins) sai por `block-sender.service.ts`, que sabe
 * desenhar card, gráfico e tabela. Aqui fica só o caminho simples.
 */

const MESSAGE_LIMIT = 4096

function clamp(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`
}

export async function sendTextNotification(chatId: TelegramChatId, text: string): Promise<void> {
  await sendTelegramMessage(chatId, clamp(text, MESSAGE_LIMIT))
}
