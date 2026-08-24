import {
  deleteAppSettings,
  readAppSecrets,
  writeAppSecrets,
} from "@/features/settings/services/app-settings-service"
import { AI_PROVIDER_IDS, type AiProviderId } from "../lib/catalog"

/**
 * Configuração de IA da instalação, guardada CIFRADA em `app_settings`:
 * - `ai.keys.<provedor>`: a chave de API de cada provedor;
 * - `ai.compatible.baseUrl`: o endereço do endpoint OpenAI-compatible (self-host);
 * - `ai.models`: JSON {fast, smart} — modelo econômico e modelo avançado;
 * - `ai.budget`: JSON {monthlyLimitUsd} — teto mensal (null = sem teto).
 *
 * Reserva: sem chave no banco, `OPENAI_API_KEY` do ambiente continua valendo
 * (instalações antigas). Padrão dos modelos: gpt-4o-mini nos dois níveis —
 * exatamente o comportamento que o app tinha antes desta camada existir.
 */

export interface AiModelChoice {
  provider: AiProviderId
  model: string
}

export interface AiConfig {
  /** Chaves por provedor (só os configurados aparecem). */
  keys: Partial<Record<AiProviderId, string>>
  /** De onde veio a chave de cada provedor (banco ou variável de ambiente). */
  keySources: Partial<Record<AiProviderId, "db" | "env">>
  compatibleBaseUrl: string | null
  models: { fast: AiModelChoice; smart: AiModelChoice }
  budget: { monthlyLimitUsd: number | null }
}

const KEY_PREFIX = "ai.keys."
const COMPATIBLE_BASE_URL_KEY = "ai.compatible.baseUrl"
const MODELS_KEY = "ai.models"
const BUDGET_KEY = "ai.budget"

/** Nome da entrada em `app_settings` que guarda a chave de um provedor. */
export function aiKeySettingName(provider: AiProviderId): string {
  return `${KEY_PREFIX}${provider}`
}

export const AI_SETTING_KEYS = [
  ...AI_PROVIDER_IDS.map((id) => `${KEY_PREFIX}${id}`),
  COMPATIBLE_BASE_URL_KEY,
  MODELS_KEY,
  BUDGET_KEY,
]

export const DEFAULT_MODEL: AiModelChoice = { provider: "openai", model: "gpt-4o-mini" }

function isProviderId(value: unknown): value is AiProviderId {
  return typeof value === "string" && (AI_PROVIDER_IDS as string[]).includes(value)
}

function parseModelChoice(value: unknown): AiModelChoice | null {
  if (!value || typeof value !== "object") return null
  const { provider, model } = value as { provider?: unknown; model?: unknown }
  if (!isProviderId(provider) || typeof model !== "string" || !model.trim()) return null
  return { provider, model: model.trim() }
}

const CACHE_TTL_MS = 60_000
let cache: { value: AiConfig; at: number } | null = null

export function invalidateAiConfigCache() {
  cache = null
}

export async function getAiConfig(): Promise<AiConfig> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value

  const secrets = await readAppSecrets(AI_SETTING_KEYS)

  const keys: AiConfig["keys"] = {}
  const keySources: AiConfig["keySources"] = {}
  for (const id of AI_PROVIDER_IDS) {
    const stored = secrets.get(`${KEY_PREFIX}${id}`)
    if (stored) {
      keys[id] = stored
      keySources[id] = "db"
    }
  }
  // Reserva: a env antiga da OpenAI segue valendo enquanto o banco não tiver chave.
  if (!keys.openai && process.env.OPENAI_API_KEY) {
    keys.openai = process.env.OPENAI_API_KEY
    keySources.openai = "env"
  }

  let models: AiConfig["models"] = { fast: DEFAULT_MODEL, smart: DEFAULT_MODEL }
  const rawModels = secrets.get(MODELS_KEY)
  if (rawModels) {
    try {
      const parsed = JSON.parse(rawModels) as { fast?: unknown; smart?: unknown }
      const fast = parseModelChoice(parsed.fast)
      const smart = parseModelChoice(parsed.smart)
      if (fast && smart) models = { fast, smart }
    } catch {
      // JSON corrompido = como se não existisse; a tela regrava.
    }
  }

  let budget: AiConfig["budget"] = { monthlyLimitUsd: null }
  const rawBudget = secrets.get(BUDGET_KEY)
  if (rawBudget) {
    try {
      const parsed = JSON.parse(rawBudget) as { monthlyLimitUsd?: unknown }
      if (typeof parsed.monthlyLimitUsd === "number" && parsed.monthlyLimitUsd >= 0) {
        budget = { monthlyLimitUsd: parsed.monthlyLimitUsd }
      }
    } catch {
      // idem
    }
  }

  const value: AiConfig = {
    keys,
    keySources,
    compatibleBaseUrl: secrets.get(COMPATIBLE_BASE_URL_KEY) ?? null,
    models,
    budget,
  }
  cache = { value, at: Date.now() }
  return value
}

/** Resumo para telas: NUNCA inclui chave nenhuma — só "configurada e de onde". */
export interface AiStatusSummary {
  providers: Record<AiProviderId, { configured: boolean; source: "db" | "env" | null }>
  compatibleBaseUrl: string | null
  models: { fast: AiModelChoice; smart: AiModelChoice }
  budget: { monthlyLimitUsd: number | null }
}

export async function getAiStatusSummary(): Promise<AiStatusSummary> {
  const config = await getAiConfig()
  const providers = Object.fromEntries(
    AI_PROVIDER_IDS.map((id) => [
      id,
      { configured: Boolean(config.keys[id]), source: config.keySources[id] ?? null },
    ]),
  ) as AiStatusSummary["providers"]
  return {
    providers,
    compatibleBaseUrl: config.compatibleBaseUrl,
    models: config.models,
    budget: config.budget,
  }
}

/** Grava/remove a chave de um provedor (null = remover). */
export async function saveAiProviderKey(provider: AiProviderId, apiKey: string | null): Promise<void> {
  const key = `${KEY_PREFIX}${provider}`
  if (apiKey) {
    await writeAppSecrets({ [key]: apiKey })
  } else {
    await deleteAppSettings([key])
  }
  invalidateAiConfigCache()
}

export async function saveCompatibleBaseUrl(baseUrl: string | null): Promise<void> {
  if (baseUrl) {
    await writeAppSecrets({ [COMPATIBLE_BASE_URL_KEY]: baseUrl })
  } else {
    await deleteAppSettings([COMPATIBLE_BASE_URL_KEY])
  }
  invalidateAiConfigCache()
}

export async function saveAiModels(models: { fast: AiModelChoice; smart: AiModelChoice }): Promise<void> {
  await writeAppSecrets({ [MODELS_KEY]: JSON.stringify(models) })
  invalidateAiConfigCache()
}

export async function saveAiBudget(monthlyLimitUsd: number | null): Promise<void> {
  await writeAppSecrets({ [BUDGET_KEY]: JSON.stringify({ monthlyLimitUsd }) })
  invalidateAiConfigCache()
}
