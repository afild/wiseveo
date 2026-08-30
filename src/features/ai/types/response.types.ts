import { z } from "zod"

/**
 * O FORMATO DA RESPOSTA — o contrato que dá liberdade à IA sem quebrar o
 * desenho.
 *
 * A IA não escreve layout: ela escolhe BLOCOS e os preenche. Pode responder com
 * um card, uma tabela de trinta linhas, três parágrafos, uma lista, ou os
 * quatro na ordem que quiser. Quem desenha somos nós, e cada canal desenha do
 * seu jeito (imagem no Telegram, HTML na página).
 *
 * Por que não deixar escrever HTML/CSS direto: o motor de imagem (satori) não
 * tem tabela nem grid, e ESTOURA quando encontra uma div com vários filhos sem
 * `display: flex`. Layout livre viraria card que não renderiza — e a pessoa não
 * receberia nada. Com blocos, o pior caso é um bloco feio, nunca uma mensagem
 * perdida.
 *
 * DUAS REGRAS DO MODO ESTRITO DA OPENAI, e as duas custaram caro:
 *
 * 1. `.nullable()` em vez de `.optional()` em TODO campo que pode faltar — toda
 *    chave é obrigatória, e o "não informado" é nulo (lição da Etapa 1).
 * 2. NENHUM limite de tamanho no esquema. `min`/`max` viram `minItems`,
 *    `maxItems` e `minimum` no JSON Schema, e o modo estrito RECUSA essas
 *    chaves: o provedor devolve 400 antes de ler a pergunta, e todo canal para
 *    de responder de uma vez. Os limites viraram texto na descrição (o modelo
 *    lê) e corte em `clampBlocks` (nós garantimos).
 *
 * Ambas guardadas por `tests/ai-structured-schemas.test.ts`.
 */

const toneSchema = z.enum(["default", "positive", "negative", "warning"])

/* i18n-ignore: descrições lidas pelo MODELO, não são texto de UI */
const cardBlockSchema = z.object({
  kind: z.literal("card"),
  eyebrow: z
    .string()
    .nullable()
    // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
    .describe("Contexto curto: período, conta, categoria. NÃO repita o headline aqui."),
  // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
  headline: z.string().describe("O assunto do card, em até 5 palavras."),
  highlight: z
    .object({
      label: z.string(),
      // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
      value: z.string().describe("Valor JÁ FORMATADO vindo das ferramentas."),
      tone: toneSchema,
    })
    .nullable()
    // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
    .describe("O número que resume tudo, em destaque."),
  rows: z
    .array(
      z.object({
        label: z.string(),
        // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
        value: z.string().describe("Valor JÁ FORMATADO vindo das ferramentas."),
        detail: z.string().nullable(),
        tone: toneSchema,
      }),
    )
    // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
    .describe("Linhas do card, no máximo 30. Use quantas precisar: o card cresce para caber."),
  // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
  footnote: z.string().nullable().describe("Uma linha de leitura do quadro."),
})

/* i18n-ignore */
const tableBlockSchema = z.object({
  kind: z.literal("table"),
  title: z.string().nullable(),
  columns: z
    .array(z.string())
    // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
    .describe("Entre 2 e 4 colunas: mais que isso não cabe na tela de um celular. A coluna de valor deve ser a ÚLTIMA."),
  // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
  rows: z.array(z.array(z.string())).describe("Linhas da tabela, no máximo 40."),
})

/* i18n-ignore */
const textBlockSchema = z.object({
  kind: z.literal("text"),
  // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
  paragraphs: z.array(z.string()).describe("Parágrafos de texto corrido, no máximo 6. Sem markdown, sem HTML."),
})

/* i18n-ignore */
const bulletsBlockSchema = z.object({
  kind: z.literal("bullets"),
  title: z.string().nullable(),
  // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
  items: z.array(z.string()).describe("Pontos curtos, no máximo 10."),
})

/* i18n-ignore */
const chartBlockSchema = z.object({
  kind: z.literal("chart"),
  title: z.string().nullable(),
  bars: z
    .array(
      z.object({
        label: z.string(),
        // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
        value: z.string().describe("O valor JÁ FORMATADO, que aparece escrito ao lado da barra."),
        weight: z
          .number()
          .describe(
            // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
            "Tamanho relativo da barra (qualquer número positivo na mesma escala das outras). Serve SÓ para desenhar; o que a pessoa lê é o campo value.",
          ),
        tone: toneSchema,
      }),
    )
    // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
    .describe("De 2 a 12 barras. Menos de 2 não é comparação; mais de 12 não se lê no celular."),
  footnote: z.string().nullable(),
})

export const responseBlockSchema = z.discriminatedUnion("kind", [
  chartBlockSchema,
  cardBlockSchema,
  tableBlockSchema,
  textBlockSchema,
  bulletsBlockSchema,
])

export const composedResponseSchema = z.object({
  blocks: z
    .array(responseBlockSchema)
    // i18n-ignore: descrição lida pelo MODELO
    .describe("Os blocos da resposta, no máximo 6, na ordem em que a pessoa vai ler."),
})

export type ResponseBlock = z.infer<typeof responseBlockSchema>
export type CardBlock = Extract<ResponseBlock, { kind: "card" }>
export type TableBlock = Extract<ResponseBlock, { kind: "table" }>
export type TextBlock = Extract<ResponseBlock, { kind: "text" }>
export type BulletsBlock = Extract<ResponseBlock, { kind: "bullets" }>
export type ChartBlock = Extract<ResponseBlock, { kind: "chart" }>
export type ComposedResponse = z.infer<typeof composedResponseSchema>

const LIMITS = {
  blocks: 6,
  cardRows: 30,
  tableColumns: 4,
  tableRows: 40,
  paragraphs: 6,
  bullets: 10,
  bars: 12,
} as const

/**
 * Os limites que o esquema NÃO pode mais exigir.
 *
 * O modo estrito da OpenAI recusa `maxItems` — pedir o limite no esquema fazia o
 * provedor devolver 400 e nenhum canal responder. Então o limite é pedido em
 * texto (o modelo quase sempre respeita) e GARANTIDO aqui: uma tabela de 200
 * linhas não derruba nada, ela chega cortada.
 */
export function clampBlocks(blocks: ResponseBlock[]): ResponseBlock[] {
  return blocks.slice(0, LIMITS.blocks).map((block) => {
    if (block.kind === "card") {
      return { ...block, rows: block.rows.slice(0, LIMITS.cardRows) }
    }
    if (block.kind === "table") {
      const columns = block.columns.slice(0, LIMITS.tableColumns)
      return {
        ...block,
        columns,
        rows: block.rows.slice(0, LIMITS.tableRows).map((row) => row.slice(0, columns.length)),
      }
    }
    if (block.kind === "text") {
      return { ...block, paragraphs: block.paragraphs.slice(0, LIMITS.paragraphs) }
    }
    if (block.kind === "chart") {
      // Peso negativo desenharia barra ao contrário; o esquema já não pode
      // exigir `minimum`, então a régua fica aqui.
      const bars = block.bars
        .slice(0, LIMITS.bars)
        .map((bar) => ({ ...bar, weight: Number.isFinite(bar.weight) ? Math.max(0, bar.weight) : 0 }))
      return { ...block, bars }
    }
    return { ...block, items: block.items.slice(0, LIMITS.bullets) }
  })
}

/** Um card sem linha nenhuma e sem destaque não é card — é ruído. */
export function isRenderableBlock(block: ResponseBlock): boolean {
  if (block.kind === "card") return Boolean(block.highlight) || block.rows.length > 0
  if (block.kind === "table") return block.rows.length > 0
  if (block.kind === "text") return block.paragraphs.some((line) => line.trim() !== "")
  // Menos de duas barras não é comparação: vira uma tarja solta na tela.
  if (block.kind === "chart") return block.bars.length >= 2
  return block.items.some((line) => line.trim() !== "")
}

/**
 * A resposta em texto puro, para a MEMÓRIA da conversa: o que a pessoa "ouviu",
 * sem marcação e sem imagem. É o que faz o "e em dezembro?" da próxima mensagem
 * fazer sentido.
 */
export function blocksToPlainText(blocks: ResponseBlock[]): string {
  const parts: string[] = []

  for (const block of blocks) {
    if (block.kind === "card") {
      const head = [block.headline, block.highlight?.value].filter(Boolean).join(": ")
      const rows = block.rows.map((row) => `${row.label}: ${row.value}`)
      parts.push([head, ...rows, block.footnote ?? ""].filter(Boolean).join("\n"))
    } else if (block.kind === "chart") {
      const bars = block.bars.map((bar) => `${bar.label}: ${bar.value}`)
      parts.push([block.title ?? "", ...bars].filter(Boolean).join("\n"))
    } else if (block.kind === "table") {
      const rows = block.rows.map((row) => row.join(" · "))
      parts.push(
        [block.title ?? "", block.columns.join(" · "), ...rows].filter(Boolean).join("\n"),
      )
    } else if (block.kind === "text") {
      parts.push(block.paragraphs.join("\n\n"))
    } else {
      parts.push(
        [block.title ?? "", ...block.items.map((item) => `• ${item}`)]
          .filter(Boolean)
          .join("\n"),
      )
    }
  }

  return parts.filter(Boolean).join("\n\n").trim()
}
