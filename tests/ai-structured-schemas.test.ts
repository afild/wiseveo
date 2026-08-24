import { describe, expect, it } from "vitest"
import { z } from "zod"
import { classificationSchema } from "../src/features/telegram/services/query-classifier.service"
import { cardSchema } from "../src/features/telegram/services/card-formatter.service"
import { AI_PROVIDER_IDS, AI_PROVIDERS } from "../src/features/ai/lib/catalog"
import { extractJsonObject } from "../src/features/ai/services/llm.service"

/**
 * A saída estruturada da OpenAI roda em modo ESTRITO por padrão neste SDK, e o modo
 * estrito recusa esquema com chave fora da lista de obrigatórias — ou seja, um
 * simples `.optional()` faria TODA pergunta do Telegram morrer antes de chegar ao
 * banco (o provedor devolve 400, não um texto ruim). Por isso os esquemas usam
 * `.nullable()`: toda chave é obrigatória e o "não informado" é nulo.
 *
 * Estes testes travam essa lição — se alguém voltar a usar `.optional()`, quebram
 * aqui, e não em produção.
 */
function jsonSchemaOf(schema: z.ZodTypeAny) {
  return z.toJSONSchema(schema) as {
    properties?: Record<string, unknown>
    required?: string[]
  }
}

function assertEveryKeyRequired(schema: z.ZodTypeAny, name: string) {
  const json = jsonSchemaOf(schema)
  const properties = Object.keys(json.properties ?? {})
  expect(properties.length, name).toBeGreaterThan(0)
  expect([...(json.required ?? [])].sort(), name).toEqual([...properties].sort())
}

describe("esquemas de saída estruturada", () => {
  it("classificador: toda chave é obrigatória (modo estrito da OpenAI)", () => {
    assertEveryKeyRequired(classificationSchema, "classificationSchema")
  })

  it("card: toda chave é obrigatória, inclusive dentro dos itens", () => {
    assertEveryKeyRequired(cardSchema, "cardSchema")
    // O array de itens é nulo-ou-lista; dentro de cada item vale a mesma regra.
    type JsonNode = {
      type?: string
      anyOf?: JsonNode[]
      items?: JsonNode
      properties?: Record<string, unknown>
      required?: string[]
    }
    const schema = z.toJSONSchema(cardSchema) as { properties: Record<string, JsonNode> }
    const itemObject = (schema.properties.items.anyOf ?? []).find((entry) => entry.type === "array")?.items
    expect(itemObject, "items schema").toBeTruthy()
    expect([...(itemObject?.required ?? [])].sort()).toEqual(
      [...Object.keys(itemObject?.properties ?? {})].sort(),
    )
  })

  it("extrai o JSON da resposta em texto (reserva dos provedores sem formato estrito)", () => {
    expect(extractJsonObject('{"intent":"budget"}')).toEqual({ intent: "budget" })
    // Cercado por ```json, como quase todo modelo faz mesmo mandando não fazer.
    expect(extractJsonObject('```json\n{"intent":"dre"}\n```')).toEqual({ intent: "dre" })
    // Com frase antes e depois.
    expect(extractJsonObject('Claro! Aqui está:\n{"intent":"budget"}\nEspero ter ajudado.')).toEqual({
      intent: "budget",
    })
    // Objetos aninhados continuam inteiros.
    expect(extractJsonObject('{"a":{"b":1},"c":2}')).toEqual({ a: { b: 1 }, c: 2 })
    // Dois objetos emendados: fica com o primeiro, em vez de falhar.
    expect(extractJsonObject('{"intent":"dre"}\n{"outro":1}')).toEqual({ intent: "dre" })
  })

  it("sem JSON de objeto, devolve nulo — nunca lança", () => {
    expect(extractJsonObject("desculpe, não consegui")).toBeNull()
    expect(extractJsonObject("")).toBeNull()
    expect(extractJsonObject("{quebrado")).toBeNull()
    expect(extractJsonObject("[1,2,3]")).toBeNull()
  })

  it("nenhum provedor sem saída estruturada nativa fica sem caminho de reserva", () => {
    // Quem não aceita o formato estrito recebe o JSON pedido no texto e validado
    // pelo mesmo esquema — se um provedor novo entrar sem essa marca, o teste avisa.
    for (const id of AI_PROVIDER_IDS) {
      expect(typeof AI_PROVIDERS[id].structuredOutput, id).toBe("boolean")
    }
  })

  it("nulo significa 'não informado' e é aceito pelos esquemas", () => {
    expect(
      classificationSchema.safeParse({
        intent: "budget",
        period: null,
        groupName: null,
        categoryName: null,
        payeeName: null,
        accountName: null,
        transactionType: null,
        status: null,
        date: null,
        limit: null,
        searchText: null,
      }).success,
    ).toBe(true)

    expect(
      cardSchema.safeParse({
        type: "summary",
        eyebrow: null,
        headline: "Resumo",
        value: null,
        trend: null,
        insight: null,
        progress: null,
        items: null,
      }).success,
    ).toBe(true)
  })
})
