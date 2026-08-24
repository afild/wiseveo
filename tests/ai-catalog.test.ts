import { describe, expect, it } from "vitest"
import {
  AI_PROVIDER_IDS,
  AI_PROVIDERS,
  estimateCostMicroUsd,
  getModelPricePerMillion,
  microUsdToUsd,
} from "../src/features/ai/lib/catalog"
import { currentPeriod } from "../src/features/ai/services/ai-usage.service"

/**
 * O catálogo alimenta o TETO de gasto: preço errado = teto furado. Estes testes
 * guardam a busca por prefixo (o mais longo vence), a reserva conservadora para
 * modelo desconhecido e a aritmética inteira em micro-dólares.
 */
describe("getModelPricePerMillion", () => {
  it("o prefixo mais longo vence (gpt-4o-mini não é cobrado como gpt-4o)", () => {
    expect(getModelPricePerMillion("gpt-4o-mini")).toEqual({ input: 0.15, output: 0.6 })
    expect(getModelPricePerMillion("gpt-4o")).toEqual({ input: 2.5, output: 10 })
  })

  it("variações datadas caem no mesmo preço do prefixo", () => {
    expect(getModelPricePerMillion("gpt-4o-mini-2024-07-18")).toEqual({ input: 0.15, output: 0.6 })
    expect(getModelPricePerMillion("claude-sonnet-4-5-20250929")).toEqual({ input: 3, output: 15 })
  })

  it("modelo desconhecido usa a reserva conservadora (superestima, nunca subestima)", () => {
    const price = getModelPricePerMillion("modelo-que-nao-existe")
    expect(price.input).toBeGreaterThanOrEqual(3)
    expect(price.output).toBeGreaterThanOrEqual(15)
  })
})

describe("estimateCostMicroUsd", () => {
  it("preço por 1M de tokens vira micro-USD por token, em inteiro", () => {
    // gpt-4o-mini: 0,15/1M entrada + 0,60/1M saída →
    // 1M de entrada = 150_000 µUSD; 1M de saída = 600_000 µUSD
    expect(estimateCostMicroUsd("gpt-4o-mini", 1_000_000, 0)).toBe(BigInt(150_000))
    expect(estimateCostMicroUsd("gpt-4o-mini", 0, 1_000_000)).toBe(BigInt(600_000))
    expect(estimateCostMicroUsd("gpt-4o-mini", 1000, 500)).toBe(BigInt(Math.round(1000 * 0.15 + 500 * 0.6)))
  })

  it("zero tokens = custo zero; e a volta para USD confere", () => {
    expect(estimateCostMicroUsd("gpt-4o-mini", 0, 0)).toBe(BigInt(0))
    expect(microUsdToUsd(BigInt(1_500_000))).toBe(1.5)
  })
})

describe("catálogo", () => {
  it("todo provedor tem rótulo, e os de dialeto OpenAI têm endpoint fixo", () => {
    for (const id of AI_PROVIDER_IDS) {
      expect(AI_PROVIDERS[id].label.length).toBeGreaterThan(0)
    }
    expect(AI_PROVIDERS.deepseek.baseUrl).toMatch(/^https:\/\//)
    expect(AI_PROVIDERS.kimi.baseUrl).toMatch(/^https:\/\//)
    // O compatível usa o endereço do dono — nunca um fixo.
    expect(AI_PROVIDERS.compatible.baseUrl).toBeUndefined()
  })
})

describe("currentPeriod", () => {
  it("AAAAMM em UTC, com zero à esquerda", () => {
    expect(currentPeriod(new Date(Date.UTC(2026, 0, 15)))).toBe("202601")
    expect(currentPeriod(new Date(Date.UTC(2026, 11, 31, 23, 59)))).toBe("202612")
  })
})
