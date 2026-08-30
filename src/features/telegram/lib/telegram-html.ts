/**
 * Texto formatado no Telegram, montado de um jeito que não dá para errar.
 *
 * POR QUE HTML E NÃO MARKDOWN: o dinheiro deste app sai como `9.833,42` e
 * `(332,55)`. No MarkdownV2 os caracteres `(`, `)`, `.` e `-` são reservados —
 * um único valor sem contrabarra faz o Telegram devolver 400 e a mensagem
 * simplesmente NÃO CHEGA. No HTML só três caracteres precisam de cuidado.
 *
 * POR QUE UM MONTADOR E NÃO CONCATENAÇÃO: entra texto de terceiros na mensagem —
 * a descrição que o dono escreveu no lançamento e o que o modelo devolveu. Um
 * `<` numa descrição derruba a mensagem inteira. Aqui cada pedaço é escapado no
 * momento em que entra, então o resultado é seguro por construção; não existe
 * caminho em que alguém "esqueceu de escapar".
 */

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

export const html = {
  text: (value: string) => escapeHtml(value),
  bold: (value: string) => `<b>${escapeHtml(value)}</b>`,
  italic: (value: string) => `<i>${escapeHtml(value)}</i>`,
  code: (value: string) => `<code>${escapeHtml(value)}</code>`,
  /** Bloco monoespaçado — é o que faz uma tabela ficar alinhada no celular. */
  pre: (value: string) => `<pre>${escapeHtml(value)}</pre>`,
  blockquote: (value: string) => `<blockquote>${escapeHtml(value)}</blockquote>`,
}

/**
 * Largura confortável de uma tabela monoespaçada no celular.
 *
 * O Telegram quebra a linha do `<pre>` que passar da largura da tela; num
 * aparelho comum cabem ~34 caracteres antes de a tabela virar sopa. É uma META,
 * não uma lei: ver `monospaceTable`.
 */
export const MONOSPACE_WIDTH = 34

/** Largura mínima de uma coluna de texto depois de encolhida. */
const MIN_TEXT_WIDTH = 8

function padRight(value: string, size: number): string {
  return value.length >= size ? value : value + " ".repeat(size - value.length)
}

function padLeft(value: string, size: number): string {
  return value.length >= size ? value : " ".repeat(size - value.length) + value
}

/** Corta TEXTO com reticências — o leitor vê que faltou pedaço. */
function ellipsize(value: string, size: number): string {
  if (value.length <= size) return value
  return size <= 1 ? value.slice(0, size) : `${value.slice(0, size - 1)}…`
}

/**
 * A célula carrega NÚMERO? Qualquer dígito basta.
 *
 * É a regra que impede o pior defeito que esta função já teve: quando a tabela
 * não cabia na largura, ela encurtava as colunas cortando as cadeias, e
 * `R$ 12.480,00` chegava como `R$ 12.` — uma cadeia de dinheiro perfeitamente
 * bem formada, errada por mil vezes. Pior: a coluna final também encolhia
 * cortando pela ESQUERDA, e `(R$ 12.950,90)` virava `R$ 12.950,90)` — o
 * parêntese É o sinal de negativo neste app, então um prejuízo aparecia como
 * ganho. Coluna com número NUNCA é encurtada; se a tabela não couber, ela fica
 * mais larga e o Telegram que quebre a linha. Tabela feia é aborrecimento;
 * número errado é mentira.
 */
function hasNumber(value: string): boolean {
  return /\d/.test(value)
}

/**
 * Monta a tabela monoespaçada. A ÚLTIMA coluna é alinhada à direita porque é
 * quase sempre o valor — e coluna de dinheiro desalinhada é impossível de somar
 * com o olho.
 */
export function monospaceTable(columns: string[], rows: string[][]): string {
  const columnCount = Math.max(1, Math.min(columns.length, 4))
  const body = rows.map((row) => Array.from({ length: columnCount }, (_, i) => row[i] ?? ""))
  const all = [columns.slice(0, columnCount), ...body]

  const natural = Array.from({ length: columnCount }, (_, i) =>
    Math.max(...all.map((row) => (row[i] ?? "").length)),
  )
  // Coluna que contém número em QUALQUER linha é intocável — inclusive quando
  // não é a última, porque o modelo escolhe livremente a ordem das colunas.
  const locked = Array.from({ length: columnCount }, (_, i) =>
    body.some((row) => hasNumber(row[i] ?? "")),
  )

  const widths = [...natural]
  const separators = columnCount - 1
  let overflow = widths.reduce((sum, w) => sum + w, 0) + separators - MONOSPACE_WIDTH

  // A folga sai só das colunas de texto, e nunca abaixo do mínimo legível.
  // Sobrando estouro depois disso, a tabela simplesmente fica mais larga.
  for (let i = 0; overflow > 0 && i < columnCount; i += 1) {
    if (locked[i]) continue
    const canTrim = Math.max(0, widths[i] - MIN_TEXT_WIDTH)
    const trim = Math.min(canTrim, overflow)
    widths[i] -= trim
    overflow -= trim
  }

  const line = (row: string[], isHeader: boolean) =>
    row
      .map((cell, i) => {
        const width = widths[i]
        // Cabeçalho acompanha a coluna: encurtar só o corpo desalinha tudo.
        const value = locked[i] && !isHeader ? cell : ellipsize(cell, width)
        return i === columnCount - 1 ? padLeft(value, width) : padRight(value, width)
      })
      .join(" ")
      .trimEnd()

  const header = line(columns.slice(0, columnCount), true)
  const rule = widths.map((w) => "─".repeat(w)).join(" ")

  return [header, rule, ...body.map((row) => line(row, false))].join("\n")
}
