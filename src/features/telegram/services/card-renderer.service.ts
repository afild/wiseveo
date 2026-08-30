import fs from "node:fs/promises"
import path from "node:path"
import { createElement, type ReactElement } from "react"
import satori from "satori"
import { Resvg } from "@resvg/resvg-js"
import { CategoryCard } from "../cards/category-card"
import { ComposedCard } from "../cards/composed-card"
import { ChartCard } from "../cards/chart-card"
import { CARD_FAMILY, CARD_SIZE, getCardTheme, type CardThemeMode } from "../cards/card-theme"
import { ErrorCard } from "../cards/error-card"
import { ListCard } from "../cards/list-card"
import { SingleValueCard } from "../cards/single-value-card"
import { SummaryCard } from "../cards/summary-card"
import type { CardData, TelegramTranslator } from "../types/telegram.types"
import type { CardBlock, ChartBlock } from "@/features/ai/types/response.types"

/**
 * O card vira PNG aqui. Três decisões que mudam tudo no resultado:
 *
 * 1. TRÊS PESOS DE FONTE, de arquivos diferentes. O satori NÃO sintetiza
 *    negrito: se todos os pesos apontarem para o mesmo arquivo regular, cada
 *    `fontWeight: 700` do desenho sai em regular e o card inteiro fica chapado.
 *    Era exatamente o que acontecia — a causa mecânica do "design genérico".
 * 2. ALTURA AUTOMÁTICA. Passando só a largura, o satori mede o conteúdo. Antes a
 *    altura era chutada (420/460/520) e o que passasse disso era cortado em
 *    silêncio pelo rasterizador: a última linha e o rodapé sumiam sem aviso.
 * 3. DOIS DE ESCALA. O PNG saía com 800px de largura e o celular ampliava, o que
 *    deixa qualquer desenho macio. Renderizar em 1600 e deixar o Telegram
 *    reduzir custa alguns quilobytes e devolve o traço nítido.
 */

const CARD_SCALE = 2

interface LoadedFont {
  weight: 400 | 600 | 700
  data: ArrayBuffer
}

let cachedFonts: LoadedFont[] | null = null

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}

async function readFirstAvailableFont(paths: string[]) {
  for (const fontPath of paths) {
    try {
      const data = await fs.readFile(fontPath)
      return bufferToArrayBuffer(data)
    } catch {
      // Try next candidate.
    }
  }

  return null
}

/** A fonte da marca, versionada no repositório — ver next.config.ts. */
function brandFont(weight: 400 | 600 | 700): string {
  return path.join(process.cwd(), "src", "assets", "card-fonts", `figtree-latin-${weight}-normal.woff`)
}

/**
 * Reserva quando a fonte da marca não estiver no disco (instalação estranha, um
 * pacote que não veio). O card sai sem negrito, mas SAI — melhor que erro.
 * WOFF2 não entra na lista: o satori não lê esse formato.
 */
const FALLBACK_FONTS = [
  process.env.TELEGRAM_CARD_FONT_PATH,
  path.join(
    process.cwd(),
    "node_modules",
    "next",
    "dist",
    "compiled",
    "@vercel",
    "og",
    "noto-sans-v27-latin-regular.ttf",
  ),
  "C:\\Windows\\Fonts\\arial.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
].filter(Boolean) as string[]

async function loadCardFonts(): Promise<LoadedFont[]> {
  if (cachedFonts) return cachedFonts

  const weights: Array<400 | 600 | 700> = [400, 600, 700]
  const loaded: LoadedFont[] = []
  for (const weight of weights) {
    const data = await readFirstAvailableFont([brandFont(weight)])
    if (data) loaded.push({ weight, data })
  }

  if (loaded.length === 0) {
    const fallback = await readFirstAvailableFont(FALLBACK_FONTS)
    if (fallback) {
      loaded.push({ weight: 400, data: fallback }, { weight: 700, data: fallback })
    }
  }

  if (loaded.length === 0) {
    // Internal diagnostic error (missing font asset on the server) — never
    // reaches the Telegram user; the caller's try/catch surfaces
    // bot.genericError instead.
    throw new Error("No compatible font found for Telegram card rendering") // i18n-ignore
  }

  cachedFonts = loaded
  return loaded
}

function renderCard(data: CardData, t: TelegramTranslator) {
  if (data.type === "list") return createElement(ListCard, { data })
  if (data.type === "category" || data.type === "comparison") return createElement(CategoryCard, { data, t })
  if (data.type === "single-value") return createElement(SingleValueCard, { data })
  if (data.type === "error") return createElement(ErrorCard, { data, t })

  return createElement(SummaryCard, { data, t })
}

async function renderToPng(element: ReactElement): Promise<Buffer> {
  const fonts = await loadCardFonts()

  // Só a LARGURA: a altura sai da medição do conteúdo. É o que permite um card
  // com o dia inteiro dentro sem ninguém precisar adivinhar quantos pixels dá.
  const svg = await satori(element, {
    width: CARD_SIZE.width,
    fonts: fonts.map((font) => ({
      name: CARD_FAMILY,
      data: font.data,
      weight: font.weight,
      style: "normal" as const,
    })),
  })

  const resvg = new Resvg(svg, {
    background: "transparent",
    fitTo: { mode: "width", value: CARD_SIZE.width * CARD_SCALE },
  })

  return Buffer.from(resvg.render().asPng())
}

/** Cards de molde fixo — o caminho antigo das consultas prontas. */
export function generateCardImage(data: CardData, t: TelegramTranslator): Promise<Buffer> {
  return renderToPng(renderCard(data, t))
}

export interface ComposedCardOptions {
  audience?: string
  mode?: CardThemeMode
}

/** O card que a IA montou. Sem molde: as linhas são as que ela escolheu. */
export function generateComposedCardImage(
  block: CardBlock,
  options: ComposedCardOptions = {},
): Promise<Buffer> {
  return renderToPng(
    createElement(ComposedCard, {
      block,
      audience: options.audience,
      theme: getCardTheme(options.mode),
    }),
  )
}

/** O gráfico de barras que a IA montou. */
export function generateChartCardImage(
  block: ChartBlock,
  options: ComposedCardOptions = {},
): Promise<Buffer> {
  return renderToPng(
    createElement(ChartCard, {
      block,
      audience: options.audience,
      theme: getCardTheme(options.mode),
    }),
  )
}
