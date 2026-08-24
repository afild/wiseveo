import { NextResponse } from "next/server"
import { getTelegramBotConfig } from "@/features/telegram/services/telegram-config.service"
import { handleTelegramUpdate } from "@/features/telegram/services/message-handler.service"
import type { TelegramWebhookUpdate } from "@/features/telegram/types/telegram.types"

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

  await handleTelegramUpdate(update)

  return NextResponse.json({ ok: true })
}
