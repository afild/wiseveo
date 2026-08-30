import type { ResponseBlock } from "@/features/ai/types/response.types"
import {
  sendTelegramChatAction,
  sendTelegramHtml,
  sendTelegramPhoto,
} from "./bot.service"
import { generateChartCardImage, generateComposedCardImage } from "./card-renderer.service"
import { html, monospaceTable } from "../lib/telegram-html"
import type { TelegramChatId } from "../types/telegram.types"
import type { CardThemeMode } from "../cards/card-theme"

/**
 * Os blocos que a IA compôs viram mensagens no Telegram.
 *
 * A ORDEM é a que ela escolheu — o texto que ela pôs antes do card chega antes
 * do card. Por isso o texto acumulado é DESPEJADO toda vez que aparece uma
 * imagem: sem isso, a análise chegaria sempre depois de tudo, e a leitura que
 * ela montou se perderia.
 *
 * Cada card vira uma foto SEM legenda. O texto vai em mensagem própria porque a
 * legenda tem um terço do tamanho de uma mensagem — e porque repetir o texto
 * dentro da imagem e embaixo dela era outra reclamação legítima.
 */

/** Margem para a marcação HTML não estourar o limite de 4096 do Telegram. */
const SAFE_TEXT_LIMIT = 3500

/**
 * Uma peça sozinha maior que o limite (uma tabela de quarenta linhas, um
 * parágrafo enorme) NÃO pode ser enviada inteira: o Telegram devolve 400 e a
 * resposta some — não só aquele pedaço, a resposta INTEIRA daquela mensagem.
 *
 * O corte respeita a marcação: um bloco monoespaçado é dividido linha a linha e
 * cada metade ganha as próprias etiquetas. Cortar no meio dele deixaria uma
 * etiqueta aberta e derrubaria a mensagem do mesmo jeito.
 */
function splitOversized(piece: string): string[] {
  if (piece.length <= SAFE_TEXT_LIMIT) return [piece]

  const preMatch = piece.match(/^([\s\S]*?)<pre>([\s\S]*)<\/pre>$/)
  if (preMatch) {
    const [, head, body] = preMatch
    const parts: string[] = []
    let current: string[] = []
    let size = head.length
    for (const line of body.split("\n")) {
      if (size + line.length + 1 > SAFE_TEXT_LIMIT && current.length > 0) {
        parts.push(`<pre>${current.join("\n")}</pre>`)
        current = []
        size = 0
      }
      current.push(line)
      size += line.length + 1
    }
    if (current.length > 0) parts.push(`<pre>${current.join("\n")}</pre>`)
    if (parts.length > 0) {
      return [head ? `${head}${parts[0]}` : parts[0], ...parts.slice(1)]
    }
  }

  // Texto comum: corta entre parágrafos, e só dentro de um parágrafo quando ele
  // sozinho já não cabe.
  const parts: string[] = []
  let current = ""
  for (const paragraph of piece.split("\n\n")) {
    let rest = paragraph
    while (rest.length > 0) {
      const room = SAFE_TEXT_LIMIT - (current ? current.length + 2 : 0)
      if (rest.length <= room) {
        current = current ? `${current}\n\n${rest}` : rest
        break
      }
      if (current) parts.push(current)
      current = ""
      if (rest.length > SAFE_TEXT_LIMIT) {
        parts.push(rest.slice(0, SAFE_TEXT_LIMIT))
        rest = rest.slice(SAFE_TEXT_LIMIT)
      }
    }
  }
  if (current) parts.push(current)
  return parts.length > 0 ? parts : [piece.slice(0, SAFE_TEXT_LIMIT)]
}

function renderTextBlocks(block: ResponseBlock): string | null {
  if (block.kind === "text") {
    return block.paragraphs
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map(html.text)
      .join("\n\n")
  }

  if (block.kind === "bullets") {
    const items = block.items
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => `• ${html.text(item)}`)
      .join("\n")
    return block.title ? `${html.bold(block.title)}\n${items}` : items
  }

  if (block.kind === "table") {
    const table = html.pre(monospaceTable(block.columns, block.rows))
    return block.title ? `${html.bold(block.title)}\n${table}` : table
  }

  return null
}

export async function sendComposedBlocks(input: {
  chatId: TelegramChatId
  blocks: ResponseBlock[]
  audience?: string
  mode?: CardThemeMode
}): Promise<void> {
  const pending: string[] = []

  async function flush() {
    if (pending.length === 0) return
    let chunk = ""
    for (const piece of pending.flatMap(splitOversized)) {
      // Junta enquanto couber; o que passar vira a próxima mensagem, cortando
      // entre blocos e nunca no meio de uma marcação (o que quebraria o HTML).
      if (chunk && chunk.length + piece.length + 2 > SAFE_TEXT_LIMIT) {
        await sendTelegramHtml(input.chatId, chunk)
        chunk = piece
      } else {
        chunk = chunk ? `${chunk}\n\n${piece}` : piece
      }
    }
    if (chunk) await sendTelegramHtml(input.chatId, chunk)
    pending.length = 0
  }

  const cardOptions = { audience: input.audience, mode: input.mode }

  for (const block of input.blocks) {
    if (block.kind === "card" || block.kind === "chart") {
      await flush()
      await sendTelegramChatAction(input.chatId, "upload_photo")
      const image =
        block.kind === "card"
          ? await generateComposedCardImage(block, cardOptions)
          : await generateChartCardImage(block, cardOptions)
      await sendTelegramPhoto(input.chatId, image)
      continue
    }

    const text = renderTextBlocks(block)
    if (text) pending.push(text)
  }

  await flush()
}
