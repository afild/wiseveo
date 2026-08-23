import { getTranslations } from "next-intl/server"
import { prisma } from "@/lib/prisma"
import type { AppLocale } from "@/i18n/config"
import { getInstallDefaultLocale } from "@/i18n/install-locale"
import { resolveDataOwnerId } from "@/lib/data-owner"
import { createMonetaryFormatter } from "@/lib/monetary"
import {
  getUserLocale,
  getUserMonetarySettings,
} from "@/features/settings/services/user-settings-service"
import { generateCardImage } from "./card-renderer.service"
import {
  sendTelegramChatAction,
  sendTelegramMessage,
  sendTelegramPhoto,
} from "./bot.service"
import { getConversationMemory, recordTelegramInteraction } from "./conversation-history.service"
import { classifyQuery } from "./query-classifier.service"
import { dispatchQuery } from "./tool-dispatcher.service"
import { formatCard } from "./card-formatter.service"
import { generateAnalystResponse } from "./analyst-response.service"
import { buildStaticResponse } from "./static-response.service"
import { buildTelegramUserContext } from "./user-context.service"
import type { TelegramChatId, TelegramToolContext, TelegramWebhookUpdate } from "../types/telegram.types"

// Resolve o locale persistido do usuário para mensagens de erro fora do fluxo
// normal (o caminho feliz resolve via ctx). Nunca lança: qualquer falha aqui
// cai no idioma da instalação.
async function resolveTelegramLocale(chatId: TelegramChatId): Promise<AppLocale> {
  try {
    const connection = await prisma.telegramConnection.findUnique({
      where: { telegramChatId: BigInt(chatId) },
      select: { userId: true },
    })
    return connection ? await getUserLocale(connection.userId) : getInstallDefaultLocale()
  } catch {
    return getInstallDefaultLocale()
  }
}

function getStartToken(text: string) {
  const match = /^\/start\s+(.+)$/i.exec(text.trim())
  return match?.[1]?.trim() ?? null
}

async function handleStartConnection(input: {
  chatId: TelegramChatId
  token: string
  username: string | null
}) {
  const pending = await prisma.telegramPendingToken.findUnique({
    where: { token: input.token },
  })

  // The pending token already resolves to a userId even when it is expired
  // or already used, so we can greet the user in their own persisted
  // locale; only when no pending token exists at all do we have no user to
  // resolve, so we fall back to the installation locale.
  const locale = pending ? await getUserLocale(pending.userId) : getInstallDefaultLocale()
  const t = await getTranslations({ locale, namespace: "telegram" })

  if (!pending || pending.used || pending.expiresAt <= new Date()) {
    await sendTelegramMessage(input.chatId, t("bot.invalidToken"))
    return
  }

  await prisma.telegramConnection.upsert({
    where: { userId: pending.userId },
    create: {
      userId: pending.userId,
      telegramChatId: BigInt(input.chatId),
      telegramUsername: input.username,
    },
    update: {
      telegramChatId: BigInt(input.chatId),
      telegramUsername: input.username,
      isActive: true,
    },
  })

  await prisma.telegramPendingToken.update({
    where: { token: input.token },
    data: { used: true },
  })

  await sendTelegramMessage(input.chatId, t("bot.connected"))
}

async function handleFinancialQuestion(chatId: TelegramChatId, text: string) {
  const connection = await prisma.telegramConnection.findUnique({
    where: { telegramChatId: BigInt(chatId) },
    include: { user: { select: { name: true, email: true, preferencesJson: true } } },
  })

  if (!connection || !connection.isActive) {
    // No linked user yet, so there is no persisted locale to resolve from.
    const t = await getTranslations({ locale: getInstallDefaultLocale(), namespace: "telegram" })
    await sendTelegramMessage(chatId, t("bot.notConnected"))
    return
  }

  // Idioma, moeda e memória de conversa são do usuário REAL; os dados financeiros
  // consultados são do dono desses dados (hoje, o próprio usuário).
  const [locale, dataOwnerId] = await Promise.all([
    getUserLocale(connection.userId),
    resolveDataOwnerId(connection.userId),
  ])
  const [t, monetarySettings] = await Promise.all([
    getTranslations({ locale, namespace: "telegram" }),
    getUserMonetarySettings(connection.userId),
  ])
  const ctx: TelegramToolContext = {
    t,
    locale,
    monetary: createMonetaryFormatter(monetarySettings),
  }

  const chatKey = String(chatId)
  const userContext = buildTelegramUserContext({
    userId: connection.userId,
    user: connection.user,
  })

  const staticResponse = buildStaticResponse(text, userContext, t)
  if (staticResponse) {
    await sendTelegramMessage(chatId, staticResponse.response)
    await recordTelegramInteraction({
      chatId: chatKey,
      userId: connection.userId,
      userText: text,
      assistantText: staticResponse.response,
    })
    return
  }

  await sendTelegramChatAction(chatId, "typing")

  const memory = await getConversationMemory({ chatId: chatKey, userId: connection.userId })
  const history = memory.recentMessages

  const classified = await classifyQuery(text, history, memory, locale)

  if (classified.intent === "unknown") {
    const response = t("bot.unknownIntent")
    await sendTelegramMessage(chatId, response)
    await recordTelegramInteraction({
      chatId: chatKey,
      userId: connection.userId,
      userText: text,
      assistantText: response,
      classified,
    })
    return
  }

  const dispatched = await dispatchQuery(dataOwnerId, classified, ctx)

  if (classified.intent === "financial_analysis") {
    await sendTelegramChatAction(chatId, "typing")
    const analysisText = await generateAnalystResponse(text, classified, dispatched, locale)
    await sendTelegramMessage(chatId, analysisText)
    await recordTelegramInteraction({
      chatId: chatKey,
      userId: connection.userId,
      userText: text,
      assistantText: analysisText,
      classified,
    })
    return
  }

  const cardData = await formatCard(text, classified, dispatched, t, locale)

  if (cardData.type === "error") {
    const response = cardData.insight ?? t("bot.cardFormatError")
    await sendTelegramMessage(chatId, response)
    await recordTelegramInteraction({
      chatId: chatKey,
      userId: connection.userId,
      userText: text,
      assistantText: response,
      classified,
    })
    return
  }

  await recordTelegramInteraction({
    chatId: chatKey,
    userId: connection.userId,
    userText: text,
    assistantText: cardData.insight ?? `${cardData.headline}: ${cardData.value ?? ""}`.trim(),
    classified,
  })

  await sendTelegramChatAction(chatId, "upload_photo")
  const imageBuffer = await generateCardImage(cardData, t)
  await sendTelegramPhoto(chatId, imageBuffer, cardData.insight)
}

export async function handleTelegramUpdate(update: TelegramWebhookUpdate) {
  const message = update.message
  if (!message?.text) return

  const text = message.text.trim()
  const chatId = message.chat.id
  const startToken = getStartToken(text)

  if (startToken) {
    await handleStartConnection({
      chatId,
      token: startToken,
      username: message.from?.username ?? null,
    })
    return
  }

  try {
    await handleFinancialQuestion(chatId, text)
  } catch (error) {
    console.error("Telegram message processing error", error)
    const t = await getTranslations({
      locale: await resolveTelegramLocale(chatId),
      namespace: "telegram",
    })
    await sendTelegramMessage(chatId, t("bot.genericError"))
  }
}
