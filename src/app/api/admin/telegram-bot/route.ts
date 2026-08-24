import { NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import crypto from "crypto"
import { isSuperAdminSession } from "@/lib/setup-access"
import { readAppSettingsStructure } from "@/features/settings/services/app-settings-service"
import {
  clearTelegramBotConfig,
  deleteTelegramWebhook,
  fetchBotIdentity,
  getTelegramBotStatus,
  getTelegramBotConfig,
  invalidateTelegramConfigCache,
  isValidBotTokenFormat,
  registerTelegramWebhook,
  resolveWebhookBaseUrl,
  saveTelegramBotConfig,
} from "@/features/telegram/services/telegram-config.service"

export const dynamic = "force-dynamic"

/**
 * O bot é da INSTALAÇÃO (o vínculo de cada pessoa é outra rota, /api/telegram/
 * connect) — então só o SUPERADMIN mexe aqui, e na demo a rota nem existe.
 *
 * POST = "cole só o token": valida no Telegram (getMe), gera o segredo do webhook,
 * grava o trio cifrado e registra o webhook sozinho. O token nunca entra em log
 * nem volta em resposta.
 */
async function guard(): Promise<boolean> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return false
  return isSuperAdminSession()
}

export async function GET() {
  if (!(await guard())) return new NextResponse(null, { status: 404 })
  try {
    const [structure, status] = await Promise.all([readAppSettingsStructure(), getTelegramBotStatus()])
    return NextResponse.json({ success: true, data: { structure, ...status } })
  } catch (error) {
    return unexpectedError(error)
  }
}

export async function POST(req: Request) {
  if (!(await guard())) return new NextResponse(null, { status: 404 })
  const t = await getTranslations("api.telegramBot")

  try {
    const body = (await req.json().catch(() => null)) as { token?: unknown } | null
    const token = typeof body?.token === "string" ? body.token.trim() : ""

    if (!isValidBotTokenFormat(token)) {
      return NextResponse.json({ success: false, code: "invalidToken", message: t("invalidToken") }, { status: 400 })
    }

    // O bot precisa só da tabela de SEGREDOS — a do medidor de IA não entra nisto.
    const structure = await readAppSettingsStructure()
    if (!structure.secretsReady) {
      return NextResponse.json({ success: false, code: "notPrepared", message: t("notPrepared") }, { status: 409 })
    }

    const identity = await fetchBotIdentity(token)
    if (!identity.ok) {
      return NextResponse.json(
        { success: false, code: identity.code, message: t(identity.code) },
        { status: identity.code === "network" ? 502 : 400 },
      )
    }

    const baseUrl = resolveWebhookBaseUrl(req)
    if (!baseUrl || !baseUrl.startsWith("https://")) {
      return NextResponse.json(
        { success: false, code: "webhookNeedsHttps", message: t("webhookNeedsHttps") },
        { status: 400 },
      )
    }

    // Grava primeiro, registra depois: se o Telegram recusar o webhook, volta o bot
    // ANTERIOR (troca falhada não pode destruir o que funcionava) — ou, sem
    // anterior, desfaz tudo. Nunca fica configuração pela metade.
    // Leitura FRESCA (sem os 60s de cache): um retrato velho aqui poderia
    // "ressuscitar" no rollback uma configuração que o dono acabou de apagar.
    invalidateTelegramConfigCache()
    const previous = await getTelegramBotConfig()
    const webhookSecret = crypto.randomBytes(32).toString("base64url")
    await saveTelegramBotConfig({ botToken: token, botUsername: identity.botUsername, webhookSecret })

    const registration = await registerTelegramWebhook({ token, webhookSecret, baseUrl })
    if (!registration.ok) {
      if (previous?.source === "db" && previous.webhookSecret) {
        await saveTelegramBotConfig({
          botToken: previous.botToken,
          botUsername: previous.botUsername,
          webhookSecret: previous.webhookSecret,
        }).catch(() => {})
        await registerTelegramWebhook({
          token: previous.botToken,
          webhookSecret: previous.webhookSecret,
          baseUrl,
        })
      } else {
        await clearTelegramBotConfig().catch(() => {})
      }
      console.error("[TELEGRAM BOT] setWebhook failed:", registration.description)
      return NextResponse.json(
        { success: false, code: "webhookFailed", message: t("webhookFailed") },
        { status: 502 },
      )
    }

    console.log("[TELEGRAM BOT] Bot connected by the owner")
    return NextResponse.json({ success: true, data: { botUsername: identity.botUsername } })
  } catch (error) {
    return unexpectedError(error)
  }
}

export async function DELETE() {
  if (!(await guard())) return new NextResponse(null, { status: 404 })
  const t = await getTranslations("api.telegramBot")

  try {
    // Fresca pelo mesmo motivo do POST: decidir "env ou banco" com retrato velho
    // apagaria (ou pouparia) a configuração errada.
    invalidateTelegramConfigCache()
    const config = await getTelegramBotConfig()
    if (config?.source === "env") {
      // Configuração por variável de ambiente não se apaga pelo app.
      return NextResponse.json({ success: false, code: "envConfigured", message: t("envConfigured") }, { status: 400 })
    }
    if (config) {
      await deleteTelegramWebhook(config.botToken)
    }
    await clearTelegramBotConfig()
    console.log("[TELEGRAM BOT] Bot disconnected by the owner")
    // Estado REAL depois de apagar: se as envs TELEGRAM_* ainda existirem, o bot
    // delas volta a valer — a tela mostra isso em vez de fingir "desconectado".
    const status = await getTelegramBotStatus()
    return NextResponse.json({ success: true, data: status })
  } catch (error) {
    return unexpectedError(error)
  }
}

async function unexpectedError(error: unknown) {
  console.error("[TELEGRAM BOT] unexpected:", error)
  const tErrors = await getTranslations("api.errors")
  return NextResponse.json({ success: false, message: tErrors("internalError") }, { status: 500 })
}
