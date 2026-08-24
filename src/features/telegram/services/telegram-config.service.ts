import {
  deleteAppSettings,
  readAppSecrets,
  writeAppSecrets,
} from "@/features/settings/services/app-settings-service"

/**
 * De onde vem a configuração do bot do Telegram, nesta ordem:
 * 1. `app_settings` (cifrado; gravado pela tela "cole só o token"); ou
 * 2. as três envs antigas (`TELEGRAM_BOT_TOKEN/USERNAME/WEBHOOK_SECRET`) — reserva
 *    para instalações configuradas antes da tela existir. Sem mistura: ou o banco
 *    tem o trio, ou valem as envs.
 *
 * O webhook agora é SEMPRE validado por segredo (fail closed): configuração sem
 * `webhookSecret` não recebe mensagem — é o furo antigo, fechado.
 */

export const TELEGRAM_SETTING_KEYS = {
  botToken: "telegram.botToken",
  botUsername: "telegram.botUsername",
  webhookSecret: "telegram.webhookSecret",
} as const

const ALL_KEYS = Object.values(TELEGRAM_SETTING_KEYS)

export interface TelegramBotConfig {
  source: "db" | "env"
  botToken: string
  botUsername: string
  webhookSecret: string | null
}

// O webhook lê a configuração a cada mensagem; 60s de cache cortam a ida ao banco
// sem segurar por muito tempo um token recém-trocado (mesma janela do data-owner).
const CACHE_TTL_MS = 60_000
let cache: { value: TelegramBotConfig | null; at: number } | null = null

export function invalidateTelegramConfigCache() {
  cache = null
}

export async function getTelegramBotConfig(): Promise<TelegramBotConfig | null> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value

  const secrets = await readAppSecrets(ALL_KEYS)
  const dbToken = secrets.get(TELEGRAM_SETTING_KEYS.botToken)
  const dbUsername = secrets.get(TELEGRAM_SETTING_KEYS.botUsername)

  let value: TelegramBotConfig | null = null
  if (dbToken && dbUsername) {
    value = {
      source: "db",
      botToken: dbToken,
      botUsername: dbUsername,
      webhookSecret: secrets.get(TELEGRAM_SETTING_KEYS.webhookSecret) ?? null,
    }
  } else if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_USERNAME) {
    value = {
      source: "env",
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      botUsername: process.env.TELEGRAM_BOT_USERNAME,
      webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || null,
    }
  }

  cache = { value, at: Date.now() }
  return value
}

/** Estado para telas (Configurações, wizard) — NUNCA inclui token ou segredo. */
export async function getTelegramBotStatus(): Promise<{
  configured: boolean
  source: "db" | "env" | null
  botUsername: string | null
}> {
  const config = await getTelegramBotConfig()
  return {
    configured: config !== null,
    source: config?.source ?? null,
    botUsername: config?.botUsername ?? null,
  }
}

/** Grava o trio cifrado no banco e derruba o cache. */
export async function saveTelegramBotConfig(input: {
  botToken: string
  botUsername: string
  webhookSecret: string
}): Promise<void> {
  await writeAppSecrets({
    [TELEGRAM_SETTING_KEYS.botToken]: input.botToken,
    [TELEGRAM_SETTING_KEYS.botUsername]: input.botUsername,
    [TELEGRAM_SETTING_KEYS.webhookSecret]: input.webhookSecret,
  })
  invalidateTelegramConfigCache()
}

/** Remove o trio do banco (desconectar) e derruba o cache. */
export async function clearTelegramBotConfig(): Promise<void> {
  await deleteAppSettings(ALL_KEYS)
  invalidateTelegramConfigCache()
}

/** Formato de token do BotFather: `<id numérico>:<35+ caracteres>`. Barato, local. */
export function isValidBotTokenFormat(token: string): boolean {
  return /^\d{5,15}:[A-Za-z0-9_-]{30,50}$/.test(token.trim())
}

const TELEGRAM_API = "https://api.telegram.org"
const TELEGRAM_TIMEOUT_MS = 10_000

export type BotIdentityResult =
  | { ok: true; botUsername: string; botName: string }
  | { ok: false; code: "invalidToken" | "network" }

/**
 * Pergunta ao Telegram quem é o dono do token (`getMe`). O token NUNCA entra em
 * log nem em mensagem de erro — só na URL da chamada, que não é registrada.
 */
export async function fetchBotIdentity(token: string): Promise<BotIdentityResult> {
  try {
    const response = await fetch(`${TELEGRAM_API}/bot${token}/getMe`, {
      signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
      cache: "no-store",
    })
    const data = (await response.json().catch(() => null)) as {
      ok?: boolean
      result?: { username?: string; first_name?: string }
    } | null
    if (!response.ok || !data?.ok || !data.result?.username) {
      return { ok: false, code: "invalidToken" }
    }
    return { ok: true, botUsername: data.result.username, botName: data.result.first_name ?? data.result.username }
  } catch {
    return { ok: false, code: "network" }
  }
}

export type WebhookRegistrationResult = { ok: true } | { ok: false; description: string }

/**
 * Registra o webhook no Telegram com o `secret_token` (volta como header em cada
 * update). A descrição de erro vem do próprio Telegram e não contém o token.
 */
export async function registerTelegramWebhook(input: {
  token: string
  webhookSecret: string
  baseUrl: string
}): Promise<WebhookRegistrationResult> {
  try {
    const response = await fetch(`${TELEGRAM_API}/bot${input.token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: `${input.baseUrl}/api/telegram/webhook`,
        secret_token: input.webhookSecret,
        allowed_updates: ["message", "callback_query"],
      }),
      signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
      cache: "no-store",
    })
    const data = (await response.json().catch(() => null)) as { ok?: boolean; description?: string } | null
    if (!response.ok || !data?.ok) {
      return { ok: false, description: data?.description ?? `HTTP ${response.status}` }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, description: error instanceof Error ? error.message : String(error) }
  }
}

/** Melhor esforço ao desconectar: o Telegram para de entregar updates. */
export async function deleteTelegramWebhook(token: string): Promise<void> {
  try {
    await fetch(`${TELEGRAM_API}/bot${token}/deleteWebhook`, {
      method: "POST",
      signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
      cache: "no-store",
    })
  } catch {
    // Sem drama: um webhook órfão só gera entregas que o app responde 403.
  }
}

/**
 * Endereço público do app para o webhook: env explícita → cabeçalhos do proxy →
 * origem da requisição. O Telegram exige HTTPS — devolver a URL deixa a rota
 * decidir se recusa (ex.: localhost em dev).
 */
export function resolveWebhookBaseUrl(req: Request): string | null {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL
  if (fromEnv) return fromEnv.replace(/\/+$/, "")
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim()
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host")
  if (host) return `${proto || "https"}://${host}`
  try {
    return new URL(req.url).origin
  } catch {
    return null
  }
}
