import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * A lista de modelos vem do PROVEDOR, e cada um responde à sua maneira. Estes
 * testes trancam as três formas de resposta e, principalmente, o que NÃO pode
 * chegar à tela: oferecer um modelo de voz ou de imagem como se fosse de
 * conversa devolveria erro na primeira pergunta do dono.
 *
 * A configuração é dublada para o teste não tocar banco nem chave de verdade.
 */
vi.mock("../src/features/ai/services/ai-config.service", () => ({
  getAiConfig: async () => ({
    keys: { openai: "sk-guardada", anthropic: "sk-ant", google: "goog", deepseek: "ds" },
    keySources: {},
    compatibleBaseUrl: "https://meu-servidor.local/v1",
    models: { fast: { provider: "openai", model: "x" }, smart: { provider: "openai", model: "x" } },
    budget: { monthlyLimitUsd: null },
  }),
}))

import {
  ModelCatalogError,
  listProviderModels,
} from "../src/features/ai/services/model-catalog.service"

interface Call {
  url: string
  headers: Record<string, string>
}

function stubFetch(payload: unknown, init: { ok?: boolean; status?: number; body?: string } = {}) {
  const calls: Call[] = []
  vi.stubGlobal("fetch", async (url: string, options: { headers?: Record<string, string> }) => {
    calls.push({ url, headers: options?.headers ?? {} })
    return {
      ok: init.ok ?? true,
      status: init.status ?? 200,
      json: async () => payload,
      text: async () => init.body ?? "",
    }
  })
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("listProviderModels", () => {
  it("dialeto OpenAI: lê `data[].id` e usa a chave guardada", async () => {
    const calls = stubFetch({
      data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }, { id: "o3" }],
    })

    expect(await listProviderModels("openai")).toEqual(["gpt-4o", "gpt-4o-mini", "o3"])
    expect(calls[0].url).toBe("https://api.openai.com/v1/models")
    expect(calls[0].headers.Authorization).toBe("Bearer sk-guardada")
  })

  it("descarta o que não serve para conversar", async () => {
    // A lista da OpenAI mistura tudo que a conta pode chamar. Oferecer
    // "text-embedding-3-small" como modelo do agente seria erro garantido.
    stubFetch({
      data: [
        { id: "gpt-4o-mini" },
        { id: "text-embedding-3-small" },
        { id: "whisper-1" },
        { id: "tts-1" },
        { id: "dall-e-3" },
        { id: "omni-moderation-latest" },
        { id: "gpt-4o-realtime-preview" },
        { id: "gpt-4o-audio-preview" },
      ],
    })

    expect(await listProviderModels("openai")).toEqual(["gpt-4o-mini"])
  })

  it("DeepSeek e Kimi falam o mesmo dialeto, em outro endereço", async () => {
    const deepseek = stubFetch({ data: [{ id: "deepseek-chat" }] })
    expect(await listProviderModels("deepseek")).toEqual(["deepseek-chat"])
    expect(deepseek[0].url).toBe("https://api.deepseek.com/v1/models")
  })

  it("o compatível usa o endereço do dono, sem barra dobrada", async () => {
    const calls = stubFetch({ data: [{ id: "meu-modelo" }] })
    expect(await listProviderModels("compatible", { baseUrl: "https://casa.local/v1/" })).toEqual([
      "meu-modelo",
    ])
    expect(calls[0].url).toBe("https://casa.local/v1/models")
  })

  it("Anthropic manda a chave no cabeçalho próprio e a versão da API", async () => {
    const calls = stubFetch({ data: [{ id: "claude-sonnet-4-5" }, { id: "claude-haiku-4-5" }] })

    expect(await listProviderModels("anthropic")).toEqual([
      "claude-haiku-4-5",
      "claude-sonnet-4-5",
    ])
    expect(calls[0].headers["x-api-key"]).toBe("sk-ant")
    // Sem a versão, a Anthropic recusa o pedido inteiro.
    expect(calls[0].headers["anthropic-version"]).toBe("2023-06-01")
  })

  it("Google tira o prefixo e só aceita quem sabe gerar conteúdo", async () => {
    stubFetch({
      models: [
        { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
        { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] },
        { name: "models/gemini-2.5-pro", supportedGenerationMethods: ["generateContent"] },
      ],
    })

    expect(await listProviderModels("google")).toEqual(["gemini-2.5-flash", "gemini-2.5-pro"])
  })

  it("sem chave, erro tipado — a tela explica em vez de mostrar lista vazia", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("não deveria nem chamar") // i18n-ignore: mensagem de teste
    })

    await expect(listProviderModels("kimi", { apiKey: "" })).rejects.toMatchObject({
      code: "noCredentials",
    })
  })

  it("recusa do provedor vira erro com o motivo, não silêncio", async () => {
    stubFetch(null, { ok: false, status: 401, body: '{"error":"invalid api key"}' })

    const error = await listProviderModels("openai").catch((e) => e)
    expect(error).toBeInstanceOf(ModelCatalogError)
    expect(error.code).toBe("providerError")
    expect(error.detail).toContain("401")
  })
})
