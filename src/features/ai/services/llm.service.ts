import { generateObject, generateText } from "ai"
import type { LanguageModel, ModelMessage, StopCondition, ToolSet } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { z } from "zod"
import { AI_PROVIDERS, type AiProviderId } from "../lib/catalog"
import { getAiConfig, type AiConfig, type AiModelChoice } from "./ai-config.service"
import { assertWithinAiBudget, recordAiUsage } from "./ai-usage.service"

/**
 * A porta única de IA do app. Consumidores pedem um NÍVEL, não um modelo:
 * - `fast`: entender/classificar/formatar (barato);
 * - `smart`: analisar de verdade (forte).
 *
 * A camada resolve o modelo do nível, verifica o teto mensal ANTES de gastar,
 * tenta o outro nível como reserva se o provedor falhar, e soma tokens/custo no
 * medidor depois. Chave de API nunca aparece em erro nem em log.
 */

export type AiTier = "fast" | "smart"

export class AiNotConfiguredError extends Error {
  constructor() {
    // i18n-ignore: erro interno tipado; quem mostra ao usuário traduz no canal
    super("No AI provider configured")
    this.name = "AiNotConfiguredError"
  }
}

function hasCredentials(choice: AiModelChoice, config: AiConfig): boolean {
  if (choice.provider === "compatible") {
    return Boolean(config.compatibleBaseUrl)
  }
  return Boolean(config.keys[choice.provider])
}

/** Instancia o modelo de um provedor. `apiKeyOverride` serve ao botão Testar. */
export function buildLanguageModel(
  choice: AiModelChoice,
  config: AiConfig,
  apiKeyOverride?: string,
  baseUrlOverride?: string,
): LanguageModel {
  const apiKey = apiKeyOverride ?? config.keys[choice.provider] ?? ""
  switch (choice.provider) {
    case "openai":
      return createOpenAI({ apiKey })(choice.model)
    case "anthropic":
      return createAnthropic({ apiKey })(choice.model)
    case "google":
      return createGoogleGenerativeAI({ apiKey })(choice.model)
    case "deepseek":
    case "kimi":
      // Falam o dialeto OpenAI (chat completions) nos endpoints fixos do catálogo.
      return createOpenAI({ apiKey, baseURL: AI_PROVIDERS[choice.provider].baseUrl }).chat(choice.model)
    case "compatible": {
      const baseURL = baseUrlOverride ?? config.compatibleBaseUrl ?? undefined
      // Self-host (Ollama etc.) costuma nem exigir chave — manda um marcador.
      return createOpenAI({ apiKey: apiKey || "not-needed", baseURL }).chat(choice.model)
    }
  }
}

function sameChoice(a: AiModelChoice, b: AiModelChoice) {
  return a.provider === b.provider && a.model === b.model
}

/** Modelo do nível + o do outro nível como reserva (se for diferente e tiver chave). */
export async function resolveTierCandidates(tier: AiTier): Promise<Array<{ choice: AiModelChoice; config: AiConfig }>> {
  const config = await getAiConfig()
  const primary = config.models[tier]
  const backup = config.models[tier === "fast" ? "smart" : "fast"]
  const ordered = sameChoice(primary, backup) ? [primary] : [primary, backup]
  const candidates = ordered
    .filter((choice) => hasCredentials(choice, config))
    .map((choice) => ({ choice, config }))
  if (candidates.length === 0) throw new AiNotConfiguredError()
  return candidates
}

type UsageLike = { inputTokens?: number; outputTokens?: number } | undefined

/**
 * `totalUsage` soma TODOS os passos (chamada com tools dá várias idas ao modelo);
 * `usage` conta só o último. Preferir o total para o medidor não subestimar o
 * gasto — é o que o roteador multi-passo da Etapa 2 vai usar.
 */
async function recordResultUsage(
  choice: AiModelChoice,
  result: { usage?: UsageLike; totalUsage?: UsageLike },
) {
  const usage = result.totalUsage ?? result.usage
  await recordAiUsage({
    provider: choice.provider,
    model: choice.model,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
  })
}

export interface AiTextParams {
  tier: AiTier
  system: string
  prompt?: string
  messages?: ModelMessage[]
  tools?: ToolSet
  stopWhen?: StopCondition<ToolSet> | Array<StopCondition<ToolSet>>
  maxOutputTokens?: number
}

export async function aiGenerateText(params: AiTextParams) {
  await assertWithinAiBudget()
  const candidates = await resolveTierCandidates(params.tier)
  let lastError: unknown
  for (const { choice, config } of candidates) {
    try {
      const common = {
        model: buildLanguageModel(choice, config),
        system: params.system,
        ...(params.tools !== undefined ? { tools: params.tools } : {}),
        ...(params.stopWhen !== undefined ? { stopWhen: params.stopWhen } : {}),
        ...(params.maxOutputTokens !== undefined ? { maxOutputTokens: params.maxOutputTokens } : {}),
      }
      // prompt e messages são mutuamente exclusivos no AI SDK — dois caminhos.
      const result = params.messages
        ? await generateText({ ...common, messages: params.messages })
        : await generateText({ ...common, prompt: params.prompt ?? "" })
      await recordResultUsage(choice, result)
      return result
    } catch (error) {
      const billed = usageFromError(error)
      if (billed) await recordResultUsage(choice, billed)
      lastError = error
      console.warn(`[AI] ${choice.provider}/${choice.model} failed, trying backup`)
    }
  }
  throw lastError
}

export interface AiObjectParams<SCHEMA extends z.ZodTypeAny> {
  tier: AiTier
  schema: SCHEMA
  system: string
  prompt: string
  maxOutputTokens?: number
}

/**
 * Provedor que só imita o dialeto da OpenAI (DeepSeek, Kimi, self-host) costuma
 * recusar o pedido de formato estrito. Para esses, pede-se o JSON no texto — com
 * o esquema junto — e valida-se com o MESMO esquema: nada entra sem conferência.
 */
async function generateObjectViaText<SCHEMA extends z.ZodTypeAny>(
  model: LanguageModel,
  choice: AiModelChoice,
  params: AiObjectParams<SCHEMA>,
) {
  // `z.toJSONSchema` é do próprio zod (dependência direta): descrever o formato
  // pelo utilitário interno do SDK de IA deixaria o app preso a um pacote que
  // aparece só de carona, e em mais de uma versão na árvore.
  const shape = JSON.stringify(z.toJSONSchema(params.schema))
  const result = await generateText({
    model,
    // i18n-ignore: instrução de prompt para o modelo, não é texto de UI
    system: `${params.system}\n\nResponda APENAS com um objeto JSON válido conforme este JSON Schema (todas as chaves são obrigatórias; use null quando não se aplicar). Sem markdown, sem comentários:\n${shape}`,
    prompt: params.prompt,
    ...(params.maxOutputTokens !== undefined ? { maxOutputTokens: params.maxOutputTokens } : {}),
  })
  // O provedor JÁ cobrou por esta resposta: medir ANTES de conferir o conteúdo,
  // senão uma resposta malformada (e a tentativa seguinte) sairia de graça no
  // medidor e furaria o teto do mês.
  await recordResultUsage(choice, result)

  const candidate = extractJsonObject(result.text)
  // i18n-ignore: erro interno (a camada troca de modelo; o usuário nunca lê isto)
  if (!candidate) throw new Error("AI response has no JSON object")
  const parsed = params.schema.safeParse(candidate)
  // i18n-ignore: erro interno
  if (!parsed.success) throw new Error("AI response does not match the schema")
  return { object: parsed.data as z.infer<SCHEMA>, metered: true }
}

/** Falha DEPOIS de o provedor cobrar (ex.: resposta que não bate com o esquema). */
function usageFromError(error: unknown): { usage?: UsageLike; totalUsage?: UsageLike } | null {
  const withUsage = error as { usage?: UsageLike; totalUsage?: UsageLike } | null
  return withUsage?.usage || withUsage?.totalUsage ? withUsage : null
}

/**
 * Tira o objeto JSON da resposta em texto, tolerando o que os modelos costumam
 * fazer: cercar com ```json, escrever uma frase antes, ou emendar dois objetos.
 * Devolve `null` quando não há JSON válido — nunca lança.
 */
export function extractJsonObject(text: string): unknown | null {
  const withoutFences = text.replace(/```(?:json)?/gi, "").trim()
  const attempts: string[] = [withoutFences]

  // Do primeiro "{" até o último "}" — e, se isso não valer, do primeiro "{"
  // até o "}" que fecha o PRIMEIRO objeto (caso venham dois emendados).
  const start = withoutFences.indexOf("{")
  const end = withoutFences.lastIndexOf("}")
  if (start >= 0 && end > start) attempts.push(withoutFences.slice(start, end + 1))
  if (start >= 0) {
    let depth = 0
    for (let i = start; i < withoutFences.length; i++) {
      if (withoutFences[i] === "{") depth++
      else if (withoutFences[i] === "}" && --depth === 0) {
        attempts.push(withoutFences.slice(start, i + 1))
        break
      }
    }
  }

  for (const attempt of attempts) {
    try {
      const value = JSON.parse(attempt)
      if (value && typeof value === "object" && !Array.isArray(value)) return value
    } catch {
      // Tentativa seguinte.
    }
  }
  return null
}

export async function aiGenerateObject<SCHEMA extends z.ZodTypeAny>(
  params: AiObjectParams<SCHEMA>,
): Promise<z.infer<SCHEMA>> {
  await assertWithinAiBudget()
  const candidates = await resolveTierCandidates(params.tier)
  let lastError: unknown
  for (const { choice, config } of candidates) {
    try {
      const model = buildLanguageModel(choice, config)
      if (!AI_PROVIDERS[choice.provider].structuredOutput) {
        // Caminho de reserva: ele mesmo mede antes de conferir o conteúdo.
        const viaText = await generateObjectViaText(model, choice, params)
        return viaText.object
      }
      try {
        const result = await generateObject({
          model,
          schema: params.schema,
          system: params.system,
          prompt: params.prompt,
          ...(params.maxOutputTokens !== undefined ? { maxOutputTokens: params.maxOutputTokens } : {}),
        })
        await recordResultUsage(choice, result)
        return result.object as z.infer<SCHEMA>
      } catch (strictError) {
        // O modo estrito da OpenAI é exigente com o FORMATO do esquema, não com
        // o conteúdo: um `.optional()` ou um limite de tamanho fazem o provedor
        // devolver 400 antes de ler a pergunta — e, como o compositor serve o
        // Telegram e o Advisor, os dois emudecem ao mesmo tempo. Já aconteceu
        // duas vezes. Antes de desistir do provedor, tenta o mesmo modelo pelo
        // caminho de reserva, que pede o JSON no texto e valida com o MESMO
        // esquema: a resposta sai um pouco mais lenta, mas sai.
        const billedStrict = usageFromError(strictError)
        if (billedStrict) await recordResultUsage(choice, billedStrict)
        console.warn(
          // i18n-ignore: linha de log do servidor, nunca renderizada em UI
          `[AI] ${choice.provider}/${choice.model} refused structured output, falling back to text`,
        )
        const viaText = await generateObjectViaText(model, choice, params)
        return viaText.object
      }
    } catch (error) {
      // Erro que carrega consumo = o provedor cobrou e a resposta é que não
      // prestou: entra no medidor mesmo assim.
      const billed = usageFromError(error)
      if (billed) await recordResultUsage(choice, billed)
      lastError = error
      console.warn(`[AI] ${choice.provider}/${choice.model} failed, trying backup`)
    }
  }
  throw lastError
}

/**
 * Botão Testar da tela: uma chamada mínima com a chave informada (ou a guardada).
 * Devolve CÓDIGO estável (a rota traduz, regra da casa) e, no caso do provedor,
 * o detalhe já sem nenhuma chave — raspando também as variantes aparadas, porque
 * é a aparada que vai ao provedor e é ela que volta ecoada no erro.
 */
export type AiTestResult =
  | { ok: true; model: string; latencyMs: number }
  | { ok: false; code: "needsModel" }
  | { ok: false; code: "providerError"; detail: string }

/**
 * O teste só quer saber se a chave abre a porta, então pede a resposta mais
 * curta possível. Mas a OpenAI RECUSA o pedido abaixo de 16 (`Invalid
 * 'max_output_tokens': ... Expected a value >= 16`) — com 8, o botão "Testar"
 * acusava chave inválida em chave perfeitamente boa. 16 é o piso do provedor
 * mais exigente; um punhado de tokens não muda a conta de ninguém.
 */
const TEST_MAX_OUTPUT_TOKENS = 16

export async function testAiProvider(input: {
  provider: AiProviderId
  model?: string
  apiKey?: string
  baseUrl?: string
}): Promise<AiTestResult> {
  const config = await getAiConfig()
  const model =
    input.model?.trim() ||
    (config.models.fast.provider === input.provider ? config.models.fast.model : "") ||
    (config.models.smart.provider === input.provider ? config.models.smart.model : "") ||
    AI_PROVIDERS[input.provider].suggestedModels[0] ||
    ""
  if (!model) return { ok: false, code: "needsModel" }

  const choice = { provider: input.provider, model }
  const apiKey = input.apiKey?.trim() || undefined
  const startedAt = Date.now()
  try {
    const result = await generateText({
      model: buildLanguageModel(choice, config, apiKey, input.baseUrl?.trim() || undefined),
      // i18n-ignore: prompt técnico de teste, não é texto de UI
      prompt: "ping",
      maxOutputTokens: TEST_MAX_OUTPUT_TOKENS,
    })
    await recordResultUsage(choice, result)
    return { ok: true, model, latencyMs: Date.now() - startedAt }
  } catch (error) {
    let detail = error instanceof Error ? error.message : String(error)
    for (const secret of [input.apiKey, apiKey, config.keys[input.provider]]) {
      if (secret) detail = detail.split(secret).join("***")
    }
    return { ok: false, code: "providerError", detail: detail.slice(0, 200) }
  }
}
