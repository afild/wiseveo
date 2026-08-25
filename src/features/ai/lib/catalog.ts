/**
 * Catálogo de provedores de IA: identificadores, endpoints, modelos sugeridos e
 * preços de referência. TUDO aqui é DADO (nomes próprios, ids de modelo, URLs,
 * números) — não é texto de UI. Adicionar um provedor = acrescentar uma entrada.
 *
 * Os modelos listados são SUGESTÕES (aparecem como auto-completar na tela); o
 * dono pode digitar qualquer id — modelo desconhecido usa o preço de reserva.
 * Preços em dólares por MILHÃO de tokens (entrada/saída), estimativas para o
 * teto de gasto — a fatura oficial é a do provedor.
 */

export type AiProviderId = "openai" | "anthropic" | "google" | "deepseek" | "kimi" | "compatible"

export const AI_PROVIDER_IDS: AiProviderId[] = [
  "openai",
  "anthropic",
  "google",
  "deepseek",
  "kimi",
  "compatible",
]

export interface AiProviderInfo {
  /* i18n-ignore: nomes próprios de empresas/produtos, iguais nos 3 idiomas */
  label: string
  /** Endpoint fixo dos que falam o dialeto OpenAI; `compatible` usa o do dono. */
  baseUrl?: string
  suggestedModels: string[]
  /**
   * Aceita "saída estruturada" nativa (o provedor garante o formato)? Os que
   * imitam o dialeto da OpenAI costumam aceitar só "responda em JSON", e recusam
   * o pedido estrito com erro. Para esses, a camada pede o JSON no texto e valida
   * com o MESMO esquema — sem confiar cegamente no que voltou.
   */
  structuredOutput: boolean
}

/* i18n-ignore: dados do catálogo (nomes próprios, ids de modelo, URLs) */
export const AI_PROVIDERS: Record<AiProviderId, AiProviderInfo> = {
  openai: {
    label: "OpenAI",
    suggestedModels: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"],
    structuredOutput: true,
  },
  anthropic: {
    label: "Anthropic (Claude)",
    suggestedModels: ["claude-haiku-4-5", "claude-sonnet-4-5"],
    structuredOutput: true,
  },
  google: {
    label: "Google (Gemini)",
    suggestedModels: ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-pro"],
    structuredOutput: true,
  },
  deepseek: {
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    suggestedModels: ["deepseek-chat", "deepseek-reasoner"],
    structuredOutput: false,
  },
  kimi: {
    label: "Kimi (Moonshot)",
    baseUrl: "https://api.moonshot.ai/v1",
    suggestedModels: ["moonshot-v1-8k", "moonshot-v1-32k"],
    structuredOutput: false,
  },
  compatible: {
    label: "OpenAI-compatible",
    suggestedModels: [],
    structuredOutput: false,
  },
}

/** [entrada, saída] em USD por 1M de tokens. Busca por prefixo do id do modelo. */
/* i18n-ignore: dados de preço */
const MODEL_PRICES_PER_MILLION: Array<[prefix: string, input: number, output: number]> = [
  ["gpt-4o-mini", 0.15, 0.6],
  ["gpt-4o", 2.5, 10],
  ["gpt-4.1-mini", 0.4, 1.6],
  ["gpt-4.1", 2, 8],
  ["claude-haiku-4-5", 1, 5],
  ["claude-sonnet-4-5", 3, 15],
  ["claude-3-5-haiku", 0.8, 4],
  ["gemini-2.0-flash", 0.1, 0.4],
  ["gemini-2.5-flash", 0.3, 2.5],
  ["gemini-2.5-pro", 1.25, 10],
  ["deepseek-chat", 0.27, 1.1],
  ["deepseek-reasoner", 0.55, 2.19],
  ["moonshot-v1", 0.2, 2],
]

/** Reserva conservadora para modelo desconhecido: melhor superestimar o gasto. */
const FALLBACK_PRICE: [input: number, output: number] = [3, 15]

export function getModelPricePerMillion(model: string): { input: number; output: number } {
  const normalized = model.trim().toLowerCase()
  // O prefixo mais longo vence ("gpt-4o-mini" antes de "gpt-4o").
  let best: [string, number, number] | null = null
  for (const entry of MODEL_PRICES_PER_MILLION) {
    if (normalized.startsWith(entry[0]) && (!best || entry[0].length > best[0].length)) {
      best = entry
    }
  }
  const [, input, output] = best ?? ["", ...FALLBACK_PRICE]
  return { input, output }
}

/** Custo estimado em MICRO-dólares (inteiro): soma sem erro de vírgula. */
export function estimateCostMicroUsd(model: string, inputTokens: number, outputTokens: number): bigint {
  const price = getModelPricePerMillion(model)
  // preço é por 1M de tokens; micro-USD = USD * 1e6 → custo = tokens * preço
  const micro = inputTokens * price.input + outputTokens * price.output
  return BigInt(Math.round(micro))
}

export function microUsdToUsd(micro: bigint): number {
  return Number(micro) / 1_000_000
}

/**
 * Transcrição (áudio → texto) é cobrada por MINUTO, não por token. Preços em
 * dólares por minuto; reserva conservadora para modelo desconhecido.
 */
/* i18n-ignore: dados de preço */
const TRANSCRIPTION_PRICE_PER_MINUTE: Array<[prefix: string, usdPerMinute: number]> = [
  ["gpt-4o-mini-transcribe", 0.003],
  ["gpt-4o-transcribe", 0.006],
  ["whisper", 0.006],
]

const FALLBACK_TRANSCRIPTION_PRICE = 0.01

/**
 * Duração mínima cobrada. Sem ela, um áudio cuja duração o provedor não informa
 * entraria no medidor como GRÁTIS — e o teto do mês nunca chegaria.
 */
const MIN_BILLED_SECONDS = 5

export function estimateTranscriptionCostMicroUsd(model: string, seconds: number): bigint {
  const normalized = model.trim().toLowerCase()
  const entry = TRANSCRIPTION_PRICE_PER_MINUTE.find(([prefix]) => normalized.startsWith(prefix))
  const perMinute = entry?.[1] ?? FALLBACK_TRANSCRIPTION_PRICE
  const billedSeconds = Math.max(MIN_BILLED_SECONDS, seconds || 0)
  return BigInt(Math.round((billedSeconds / 60) * perMinute * 1_000_000))
}

/**
 * Preço do token de ÁUDIO (USD por 1M) nos modelos que engolem som direto no
 * pedido de texto — é várias vezes o preço do token escrito, então cobrar pela
 * tabela normal subestimaria o gasto em quase 7 vezes no Gemini Flash.
 */
/* i18n-ignore: dados de preço */
const AUDIO_INPUT_PRICE_PER_MILLION: Array<[prefix: string, usd: number]> = [
  ["gemini-2.0-flash", 0.7],
  ["gemini-2.5-flash", 1.0],
  ["gemini-2.5-pro", 1.25],
]

const FALLBACK_AUDIO_INPUT_PRICE = 1.5

/** Custo de uma chamada de texto cuja ENTRADA é áudio (caminho de reserva). */
export function estimateAudioPromptCostMicroUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): bigint {
  const normalized = model.trim().toLowerCase()
  const audioIn =
    AUDIO_INPUT_PRICE_PER_MILLION.find(([prefix]) => normalized.startsWith(prefix))?.[1] ??
    FALLBACK_AUDIO_INPUT_PRICE
  const textOut = getModelPricePerMillion(model).output
  return BigInt(Math.round(Math.max(0, inputTokens) * audioIn + Math.max(0, outputTokens) * textOut))
}
