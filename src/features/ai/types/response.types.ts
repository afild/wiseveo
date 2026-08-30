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
 * `.nullable()` em vez de `.optional()` em TODO campo que pode faltar: o modo
 * estrito da OpenAI recusa esquema com opcional e devolve 400 — a lição cara da
 * Etapa 1, guardada por `tests/ai-structured-schemas.test.ts`.
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
    .max(30)
    // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
    .describe("Linhas do card. Use quantas precisar: cabem todas, o card cresce."),
  // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
  footnote: z.string().nullable().describe("Uma linha de leitura do quadro."),
})

/* i18n-ignore */
const tableBlockSchema = z.object({
  kind: z.literal("table"),
  title: z.string().nullable(),
  columns: z
    .array(z.string())
    .min(2)
    .max(4)
    // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
    .describe("No máximo 4 colunas: mais que isso não cabe na tela de um celular."),
  rows: z.array(z.array(z.string()).max(4)).max(40),
})

/* i18n-ignore */
const textBlockSchema = z.object({
  kind: z.literal("text"),
  // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
  paragraphs: z.array(z.string()).max(6).describe("Texto corrido. Sem markdown, sem HTML."),
})

/* i18n-ignore */
const bulletsBlockSchema = z.object({
  kind: z.literal("bullets"),
  title: z.string().nullable(),
  items: z.array(z.string()).max(10),
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
          .min(0)
          .describe(
            // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
            "Tamanho relativo da barra (qualquer número positivo na mesma escala das outras). Serve SÓ para desenhar; o que a pessoa lê é o campo value.",
          ),
        tone: toneSchema,
      }),
    )
    .min(2)
    .max(12),
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
    .min(1)
    .max(6)
    // i18n-ignore: descrição lida pelo MODELO
    .describe("Os blocos da resposta, na ordem em que a pessoa vai ler."),
})

export type ResponseBlock = z.infer<typeof responseBlockSchema>
export type CardBlock = Extract<ResponseBlock, { kind: "card" }>
export type TableBlock = Extract<ResponseBlock, { kind: "table" }>
export type TextBlock = Extract<ResponseBlock, { kind: "text" }>
export type BulletsBlock = Extract<ResponseBlock, { kind: "bullets" }>
export type ChartBlock = Extract<ResponseBlock, { kind: "chart" }>
export type ComposedResponse = z.infer<typeof composedResponseSchema>

/** Um card sem linha nenhuma e sem destaque não é card — é ruído. */
export function isRenderableBlock(block: ResponseBlock): boolean {
  if (block.kind === "card") return Boolean(block.highlight) || block.rows.length > 0
  if (block.kind === "table") return block.rows.length > 0
  if (block.kind === "text") return block.paragraphs.some((line) => line.trim() !== "")
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
