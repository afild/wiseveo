import { NextResponse, after } from "next/server"
import { getTelegramBotConfig } from "@/features/telegram/services/telegram-config.service"
import { handleTelegramUpdate } from "@/features/telegram/services/message-handler.service"
import type { TelegramWebhookUpdate } from "@/features/telegram/types/telegram.types"

/**
 * O trabalho pesado roda DEPOIS da resposta.
 *
 * Desde que toda pergunta passou a ir ao modelo forte, uma resposta leva dez,
 * vinte, às vezes quarenta segundos: pesquisa com ferramentas, composição,
 * desenho do card e envio. O Telegram, porém, espera o 200 em poucos segundos —
 * e, sem ele, REENVIA a mesma mensagem. A trava por `update_id` reconhece o
 * reenvio e o descarta, o que era o comportamento certo mas produzia o pior
 * resultado possível: a pessoa não recebia NADA e nada explicava por quê.
 *
 * Com `after`, o 200 sai na hora e o processamento continua com a função viva.
 * `maxDuration` continua alto porque é ele que sustenta esse trabalho de fundo.
 */
export const maxDuration = 120

export async function POST(req: Request) {
  const config = await getTelegramBotConfig()
  if (!config) {
    // i18n-ignore: webhook chamado pelos servidores do Telegram, não por um usuário via UI
    return NextResponse.json({ error: "Telegram bot not configured" }, { status: 500 })
  }

  // Fail closed: sem segredo configurado, nenhum POST entra. (Antes, configuração
  // sem TELEGRAM_WEBHOOK_SECRET aceitava qualquer requisição — o furo foi fechado.)
  const secret = req.headers.get("x-telegram-bot-api-secret-token")
  if (!config.webhookSecret || secret !== config.webhookSecret) {
    // i18n-ignore: idem — resposta para os servidores do Telegram
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
  }

  let update: TelegramWebhookUpdate
  try {
    update = (await req.json()) as TelegramWebhookUpdate
  } catch {
    // i18n-ignore: webhook chamado pelos servidores do Telegram, não por um usuário via UI
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // Confirma o recebimento AGORA e processa em seguida. Erro aqui não pode
  // derrubar nada: o Telegram já foi respondido, e o canal já avisa a pessoa
  // quando o problema é de IA ou de teto.
  after(async () => {
    try {
      await handleTelegramUpdate(update)
    } catch (error) {
      console.error("[TELEGRAM] background processing failed:", error)
    }
  })

  return NextResponse.json({ ok: true })
}
