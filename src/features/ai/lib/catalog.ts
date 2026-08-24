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
