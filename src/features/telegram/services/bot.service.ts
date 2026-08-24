import TelegramBot from "node-telegram-bot-api"
import type { TelegramChatId } from "../types/telegram.types"
import { getTelegramBotConfig } from "./telegram-config.service"

// Cache preso ao token: se o dono trocar o bot em Configurações, a instância
// antiga é descartada em vez de continuar mandando mensagem pelo bot errado.
let cached: { token: string; bot: TelegramBot } | null = null

export async function getTelegramBot(): Promise<TelegramBot> {
  const config = await getTelegramBotConfig()
  if (!config) {
    // i18n-ignore: erro interno de servidor (log/exceção), nunca renderizado em UI
    throw new Error("Telegram bot not configured")
  }
  if (cached?.token !== config.botToken) {
    cached = { token: config.botToken, bot: new TelegramBot(config.botToken, { polling: false }) }
  }
  return cached.bot
}

export async function sendTelegramMessage(chatId: TelegramChatId, text: string) {
  await (await getTelegramBot()).sendMessage(chatId, text)
}

export async function sendTelegramPhoto(chatId: TelegramChatId, image: Buffer, caption?: string) {
  await (await getTelegramBot()).sendPhoto(chatId, image, caption ? { caption } : undefined)
}

export async function sendTelegramChatAction(chatId: TelegramChatId, action: "typing" | "upload_photo") {
  await (await getTelegramBot()).sendChatAction(chatId, action)
}
