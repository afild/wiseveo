/**
 * Tradutor mínimo de marcas para os textos legais (política de privacidade e o que vier
 * depois). Esses documentos são longos e moram nos arquivos de tradução, como todo texto
 * do app; quebrar cada parágrafo numa chave própria daria cem chaves por idioma e
 * nenhuma delas legível para quem revisa. Então cada seção é UMA string com três marcas:
 *
 *   linha em branco   → parágrafo novo
 *   `- ` no começo    → item de lista
 *   `**texto**`       → negrito
 *   `[texto](url)`    → link
 *
 * NÃO é markdown: não há títulos, tabelas, imagens, código nem HTML. O que não for uma
 * dessas quatro marcas é texto puro, e o resultado nunca é injetado como HTML (a página
 * monta elementos React a partir destes blocos). Manter assim de propósito.
 */

export type InlineNode =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "link"; text: string; href: string }

export type Block = { kind: "paragraph"; content: InlineNode[] } | { kind: "list"; items: InlineNode[][] }

/** `**negrito**` ou `[texto](url)`, o que vier primeiro. */
const INLINE_RE = /\*\*(.+?)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g

/**
 * Só http, https e mailto viram link. Os textos vêm dos nossos arquivos de tradução,
 * mas um `href` que aceita qualquer esquema é a porta clássica de `javascript:`; um dia
 * este renderizador pode receber texto de outro lugar, e aí a trava já está aqui.
 */
function safeHref(href: string): string | null {
  const value = href.trim()
  return /^(https?:\/\/|mailto:)/i.test(value) ? value : null
}

/** Quebra uma linha nos trechos em negrito e nos links; o resto é texto puro. */
export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = []
  let last = 0

  for (const match of text.matchAll(INLINE_RE)) {
    const start = match.index ?? 0
    if (start > last) nodes.push({ kind: "text", text: text.slice(last, start) })

    const [, strong, linkText, linkHref] = match
    if (strong !== undefined) {
      nodes.push({ kind: "strong", text: strong })
    } else {
      const href = safeHref(linkHref)
      // Endereço recusado: o texto continua aparecendo, só não vira link.
      nodes.push(href ? { kind: "link", text: linkText, href } : { kind: "text", text: linkText })
    }
    last = start + match[0].length
  }

  if (last < text.length) nodes.push({ kind: "text", text: text.slice(last) })
  return nodes
}

/** Documento inteiro de uma seção em blocos, na ordem em que devem aparecer. */
export function parseRichText(body: string): Block[] {
  return body
    .split(/\n\s*\n/)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((chunk) => {
      const lines = chunk.split("\n").map((line) => line.trim()).filter(Boolean)
      // Lista só quando TODAS as linhas do bloco são itens: assim um hífen no meio de
      // uma frase continua sendo hífen.
      if (lines.length > 0 && lines.every((line) => line.startsWith("- "))) {
        return { kind: "list" as const, items: lines.map((line) => parseInline(line.slice(2).trim())) }
      }
      return { kind: "paragraph" as const, content: parseInline(lines.join(" ")) }
    })
}
