import { AI_PROVIDERS, type AiProviderId } from "../lib/catalog"
import { getAiConfig } from "./ai-config.service"

/**
 * Quais modelos a CHAVE do dono realmente tem.
 *
 * Até aqui a tela oferecia uma lista escrita no código — que envelhece sozinha e
 * não sabe o que a conta de cada pessoa liberou. Agora quem responde é o
 * provedor.
 *
 * Três dialetos cobrem os seis provedores: OpenAI, DeepSeek, Kimi e o
 * "compatível" falam o mesmo `GET /models`; Anthropic e Google têm o seu. Nada
 * disso passa pelo AI SDK porque não é geração de texto — é uma consulta ao
 * catálogo, sem token gasto e sem nada a medir.
 */

/** Consulta de catálogo não pode segurar a tela: dez segundos e desiste. */
const REQUEST_TIMEOUT_MS = 10_000

export class ModelCatalogError extends Error {
  constructor(
    public readonly code: "noCredentials" | "providerError",
    public readonly detail?: string,
  ) {
    super(code)
    this.name = "ModelCatalogError"
  }
}

/**
 * Famílias que a lista do provedor traz junto e que NÃO servem para conversar:
 * embeddings, voz, imagem, moderação. Deixá-las na tela seria oferecer um
 * modelo que devolve erro na primeira pergunta.
 */
/* i18n-ignore: pedaços de id de modelo, não é texto de UI */
const NON_CHAT_MARKERS = [
  "embedding",
  "embed",
  "tts",
  "whisper",
  "transcribe",
  "audio",
  "realtime",
  "dall-e",
  "image",
  "moderation",
  "rerank",
  "guard",
  "stable-diffusion",
  "sora",
  "veo",
  "imagen",
  "aqa",
]

function isChatModel(id: string): boolean {
  const normalized = id.toLowerCase()
  return !NON_CHAT_MARKERS.some((marker) => normalized.includes(marker))
}

function sortModels(ids: string[]): string[] {
  return [...new Set(ids)].filter(isChatModel).sort((a, b) => a.localeCompare(b))
}

async function requestJson(url: string, headers: Record<string, string>): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    throw new ModelCatalogError(
      "providerError",
      error instanceof Error ? error.message : String(error),
    )
  }

  if (!response.ok) {
    // O corpo do erro costuma explicar melhor que o número (chave sem permissão,
    // conta sem crédito). Aparado: a tela mostra uma linha, não um despejo.
    const body = await response.text().catch(() => "")
    throw new ModelCatalogError("providerError", `${response.status} ${body.slice(0, 200)}`.trim())
  }

  return response.json().catch(() => {
    throw new ModelCatalogError("providerError", `${response.status}`)
  })
}

/** Dialeto OpenAI: `{ data: [{ id }] }`. Vale para DeepSeek, Kimi e self-host. */
async function listOpenAiDialect(baseUrl: string, apiKey: string): Promise<string[]> {
  const json = (await requestJson(`${baseUrl.replace(/\/+$/, "")}/models`, {
    Authorization: `Bearer ${apiKey}`,
  })) as { data?: Array<{ id?: unknown }> }

  return sortModels(
    (json.data ?? [])
      .map((item) => (typeof item?.id === "string" ? item.id : ""))
      .filter((id) => id !== ""),
  )
}

/** Anthropic: mesma forma, outro cabeçalho — e a versão da API é obrigatória. */
async function listAnthropic(apiKey: string): Promise<string[]> {
  const json = (await requestJson("https://api.anthropic.com/v1/models?limit=100", {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  })) as { data?: Array<{ id?: unknown }> }

  return sortModels(
    (json.data ?? [])
      .map((item) => (typeof item?.id === "string" ? item.id : ""))
      .filter((id) => id !== ""),
  )
}

/**
 * Google: o id vem prefixado ("models/gemini-…") e a lista mistura tudo que a
 * API faz. Só entram os que sabem `generateContent` — é o que o app chama.
 */
async function listGoogle(apiKey: string): Promise<string[]> {
  const json = (await requestJson(
    `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(apiKey)}`,
    {},
  )) as { models?: Array<{ name?: unknown; supportedGenerationMethods?: unknown }> }

  return sortModels(
    (json.models ?? [])
      .filter((item) => {
        const methods = item?.supportedGenerationMethods
        return Array.isArray(methods) && methods.includes("generateContent")
      })
      .map((item) => (typeof item?.name === "string" ? item.name.replace(/^models\//, "") : ""))
      .filter((id) => id !== ""),
  )
}

/**
 * A lista do provedor. `apiKey`/`baseUrl` permitem consultar ANTES de salvar —
 * é o mesmo caminho do botão "Testar". Sem chave (ou, no compatível, sem
 * endereço), erro tipado: a tela explica em vez de mostrar lista vazia.
 */
export async function listProviderModels(
  provider: AiProviderId,
  input: { apiKey?: string; baseUrl?: string } = {},
): Promise<string[]> {
  const config = await getAiConfig()
  const apiKey = input.apiKey?.trim() || config.keys[provider] || ""
  const baseUrl =
    provider === "compatible"
      ? input.baseUrl?.trim() || config.compatibleBaseUrl || ""
      : AI_PROVIDERS[provider].baseUrl || "https://api.openai.com/v1"

  if (provider === "compatible" && !baseUrl) throw new ModelCatalogError("noCredentials")
  // O self-host costuma aceitar sem chave; os demais, nunca.
  if (!apiKey && provider !== "compatible") throw new ModelCatalogError("noCredentials")

  if (provider === "anthropic") return listAnthropic(apiKey)
  if (provider === "google") return listGoogle(apiKey)
  return listOpenAiDialect(baseUrl, apiKey)
}
