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

/**
 * Mensagem FORMATADA (negrito, monoespaçado, citação).
 *
 * O texto tem de chegar aqui já montado por `src/features/telegram/lib/telegram-html.ts`,
 * que escapa cada pedaço no momento em que ele entra. Não escape aqui: escapar
 * duas vezes transformaria `<b>` em texto visível.
 */
export async function sendTelegramHtml(chatId: TelegramChatId, html: string) {
  await (await getTelegramBot()).sendMessage(chatId, html, {
    parse_mode: "HTML",
    // A resposta é sobre o dinheiro da pessoa; um cartão de pré-visualização de
    // link não tem o que fazer aqui.
    disable_web_page_preview: true,
  })
}

export async function sendTelegramPhoto(
  chatId: TelegramChatId,
  image: Buffer,
  caption?: string,
  options: { html?: boolean } = {},
) {
  await (await getTelegramBot()).sendPhoto(
    chatId,
    image,
    caption ? { caption, ...(options.html ? { parse_mode: "HTML" as const } : {}) } : undefined,
  )
}

export async function sendTelegramChatAction(chatId: TelegramChatId, action: "typing" | "upload_photo") {
  await (await getTelegramBot()).sendChatAction(chatId, action)
}

/** Tamanho máximo de áudio que aceitamos baixar (~10 min de voz do Telegram). */
const MAX_AUDIO_BYTES = 20 * 1024 * 1024

/**
 * Erro do Telegram vira UMA LINHA, sem o token. A biblioteca guarda o pedido
 * inteiro dentro do erro, e a URL do pedido carrega `/bot<token>/` — jogar esse
 * objeto no console publicaria o token no log da hospedagem.
 */
export function describeTelegramError(error: unknown): string {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return message.replace(/\/bot[^/\s]+\//g, "/bot***/")
}

/**
 * Baixa um arquivo do Telegram (usado para as mensagens de voz). O token entra
 * na URL da chamada e nunca é registrado em log.
 */
export async function downloadTelegramFile(fileId: string): Promise<Uint8Array> {
  const config = await getTelegramBotConfig()
  // i18n-ignore: erro interno; o canal traduz o que a pessoa lê
  if (!config) throw new Error("Telegram bot not configured")

  const bot = await getTelegramBot()
  const file = await bot.getFile(fileId)
  // i18n-ignore: erro interno
  if (!file.file_path) throw new Error("Telegram file has no path")
  if (file.file_size && file.file_size > MAX_AUDIO_BYTES) {
    // i18n-ignore: erro interno
    throw new Error("Telegram file is too large")
  }

  const response = await fetch(
    `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`,
    { cache: "no-store" },
  )
  // i18n-ignore: erro interno
  if (!response.ok) throw new Error(`Telegram file download failed: ${response.status}`)

  return new Uint8Array(await response.arrayBuffer())
}
