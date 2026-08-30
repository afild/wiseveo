import { getTranslations } from "next-intl/server"
import { prisma } from "@/lib/prisma"
import type { AppLocale } from "@/i18n/config"
import { getInstallDefaultLocale } from "@/i18n/install-locale"
import { resolveDataOwnerId } from "@/lib/data-owner"
import { createMonetaryFormatter } from "@/lib/monetary"
import {
  getUserCardTheme,
  getUserLocale,
  getUserMonetarySettings,
} from "@/features/settings/services/user-settings-service"
import {
  describeTelegramError,
  downloadTelegramFile,
  sendTelegramChatAction,
  sendTelegramMessage,
} from "./bot.service"
import {
  AudioNotSupportedError,
  transcribeAudio,
} from "@/features/ai/services/transcription.service"
import {
  claimTelegramUpdate,
  getConversationMemory,
  recordTelegramInteraction,
} from "./conversation-history.service"
import { AiBudgetExceededError } from "@/features/ai/services/ai-usage.service"
import { AiNotConfiguredError } from "@/features/ai/services/llm.service"
import { composeAnswer } from "@/features/ai/services/response-composer.service"
import { sendComposedBlocks } from "./block-sender.service"
import { blocksToPlainText } from "@/features/ai/types/response.types"
import { buildStaticResponse } from "./static-response.service"
import { buildTelegramUserContext } from "./user-context.service"
import type {
  TelegramChatId,
  TelegramToolContext,
  TelegramWebhookMessage,
  TelegramWebhookUpdate,
} from "../types/telegram.types"

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

  // TODA pergunta passa pelo agente agora. Antes existia um caminho barato:
  // um classificador escolhia entre onze consultas prontas e devolvia um card
  // com uma linha de legenda escrita pelo modelo ECONÔMICO — nove das onze
  // intenções nunca chegavam ao modelo forte, e a resposta saía rasa por
  // desenho. O dono preferiu pagar o modelo forte em toda mensagem a receber
  // "papagaio". O teto mensal continua sendo o freio do gasto.
  const memory = await getConversationMemory({ chatId: chatKey, userId: connection.userId })
  const blocks = await composeAnswer({
    dataOwnerId,
    question: text,
    history: memory.recentMessages,
    ctx: { ...ctx, viewerId: connection.userId, audience: userContext.firstName },
  })

  if (blocks.length === 0) {
    const response = t("bot.unknownIntent")
    await sendTelegramMessage(chatId, response)
    await recordTelegramInteraction({
      chatId: chatKey,
      userId: connection.userId,
      userText: text,
      assistantText: response,
    })
    return
  }

  // O tema é lido DEPOIS da composição: se a pessoa acabou de pedir "manda no
  // claro", a própria resposta já sai no tema novo — a ferramenta gravou a
  // preferência durante a pesquisa.
  const mode = await getUserCardTheme(connection.userId)

  await sendComposedBlocks({
    chatId,
    blocks,
    audience: userContext.firstName,
    mode,
  })

  await recordTelegramInteraction({
    chatId: chatKey,
    userId: connection.userId,
    userText: text,
    assistantText: blocksToPlainText(blocks),
  })
}

/**
 * Mensagem de voz vira pergunta escrita: baixa o áudio, transcreve e devolve o
 * texto. A partir daí o fluxo é exatamente o de quem digitou.
 */
async function transcribeVoiceMessage(
  chatId: TelegramChatId,
  audio: NonNullable<TelegramWebhookMessage["voice"]>,
): Promise<string | null> {
  const t = await getTranslations({
    locale: await resolveTelegramLocale(chatId),
    namespace: "telegram",
  })

  try {
    await sendTelegramChatAction(chatId, "typing")
    const data = await downloadTelegramFile(audio.file_id)
    const text = await transcribeAudio({
      audio: data,
      mimeType: audio.mime_type || "audio/ogg",
      durationSeconds: audio.duration,
    })
    if (!text) {
      await sendTelegramMessage(chatId, t("bot.audioEmpty"))
      return null
    }
    return text
  } catch (error) {
    if (error instanceof AudioNotSupportedError) {
      await sendTelegramMessage(chatId, t("bot.audioNotSupported"))
      return null
    }
    if (error instanceof AiBudgetExceededError) {
      await sendTelegramMessage(chatId, t("bot.budgetExceeded"))
      return null
    }
    if (error instanceof AiNotConfiguredError) {
      await sendTelegramMessage(chatId, t("bot.aiNotConfigured"))
      return null
    }
    // Só nome e mensagem, com a URL raspada: o erro cru da biblioteca do
    // Telegram carrega o token dentro do objeto de requisição.
    console.error("Telegram audio transcription failed:", describeTelegramError(error))
    await sendTelegramMessage(chatId, t("bot.audioFailed"))
    return null
  }
}

export async function handleTelegramUpdate(update: TelegramWebhookUpdate) {
  const message = update.message
  if (!message) return
  const voice = message.voice ?? message.audio
  if (!message.text && !voice) return

  const chatId = message.chat.id

  // Resposta demorada faz o Telegram reenviar a MESMA mensagem. Sem esta trava,
  // o agente rodaria de novo — e a conta viria duplicada. Vale também para o
  // áudio, cuja transcrição é paga.
  if (typeof update.update_id === "number") {
    const isNew = await claimTelegramUpdate(String(chatId), update.update_id)
    if (!isNew) return
  }

  // Transcrever CUSTA. Antes de gastar, confirmar que este chat pertence a
  // alguém desta instalação: sem isto, qualquer pessoa que descubra o nome do
  // bot mandaria áudios e a conta seria do dono. (Mensagem escrita não gasta
  // nada até o classificador, então o texto segue direto.)
  if (voice) {
    const linked = await prisma.telegramConnection.findUnique({
      where: { telegramChatId: BigInt(chatId) },
      select: { isActive: true },
    })
    if (!linked?.isActive) {
      const t = await getTranslations({
        locale: getInstallDefaultLocale(),
        namespace: "telegram",
      })
      await sendTelegramMessage(chatId, t("bot.notConnected"))
      return
    }
  }

  // Voz vira texto; falha aqui já avisa a pessoa e encerra.
  const text = voice
    ? await transcribeVoiceMessage(chatId, voice)
    : (message.text ?? "").trim()
  if (!text) return

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
    const t = await getTranslations({
      locale: await resolveTelegramLocale(chatId),
      namespace: "telegram",
    })
    // Teto mensal batido ou IA sem chave: aviso claro do QUE houve, não um
    // "erro técnico" nem um "não entendi" que esconderia a falta de configuração.
    if (error instanceof AiBudgetExceededError) {
      await sendTelegramMessage(chatId, t("bot.budgetExceeded"))
      return
    }
    if (error instanceof AiNotConfiguredError) {
      await sendTelegramMessage(chatId, t("bot.aiNotConfigured"))
      return
    }
    console.error("Telegram message processing error", error)
    await sendTelegramMessage(chatId, t("bot.genericError"))
  }
}
