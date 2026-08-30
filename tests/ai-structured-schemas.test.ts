import { describe, expect, it } from "vitest"
import { z } from "zod"
import { classificationSchema } from "../src/features/telegram/services/query-classifier.service"
import { cardSchema } from "../src/features/telegram/services/card-formatter.service"
import { composedResponseSchema, clampBlocks } from "../src/features/ai/types/response.types"
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

/**
 * O modo estrito recusa MAIS do que o `.optional()`: qualquer limite de tamanho
 * (`min`/`max` no zod) vira `minItems`/`maxItems`/`minimum` no JSON Schema, e
 * essas chaves não são permitidas. Foi o segundo 400 desta família — e derrubou
 * o Telegram E o Advisor ao mesmo tempo, porque os dois passam pelo compositor.
 */
const CHAVES_PROIBIDAS = [
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "multipleOf",
  "uniqueItems",
]

function assertSemLimitesDeTamanho(schema: z.ZodTypeAny, name: string) {
  const json = JSON.stringify(z.toJSONSchema(schema))
  for (const chave of CHAVES_PROIBIDAS) {
    expect(json.includes(`"${chave}"`), `${name} não pode declarar ${chave}`).toBe(false)
  }
}

describe("esquemas de saída estruturada", () => {
  it("nenhum esquema declara limite de tamanho (o modo estrito devolve 400)", () => {
    assertSemLimitesDeTamanho(composedResponseSchema, "composedResponseSchema")
    assertSemLimitesDeTamanho(classificationSchema, "classificationSchema")
    assertSemLimitesDeTamanho(cardSchema, "cardSchema")
  })

  it("os limites continuam existindo — garantidos por código, não pelo esquema", () => {
    const blocks = clampBlocks([
      {
        kind: "table",
        title: null,
        columns: ["a", "b", "c", "d", "e", "f"],
        rows: Array.from({ length: 90 }, () => ["1", "2", "3", "4", "5", "6"]),
      },
      { kind: "text", paragraphs: Array.from({ length: 20 }, (_, i) => `p${i}`) },
      {
        kind: "chart",
        title: null,
        footnote: null,
        bars: Array.from({ length: 30 }, () => ({
          label: "x",
          value: "1",
          weight: -5,
          tone: "default" as const,
        })),
      },
    ])

    const table = blocks[0] as Extract<(typeof blocks)[number], { kind: "table" }>
    expect(table.columns).toHaveLength(4)
    expect(table.rows).toHaveLength(40)
    expect(table.rows[0]).toHaveLength(4)

    const text = blocks[1] as Extract<(typeof blocks)[number], { kind: "text" }>
    expect(text.paragraphs).toHaveLength(6)

    const chart = blocks[2] as Extract<(typeof blocks)[number], { kind: "chart" }>
    expect(chart.bars).toHaveLength(12)
    // Peso negativo desenharia a barra ao contrário.
    expect(chart.bars.every((bar) => bar.weight >= 0)).toBe(true)
  })

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
