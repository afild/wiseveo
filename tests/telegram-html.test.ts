import { describe, expect, it } from "vitest"
import {
  escapeHtml,
  html,
  monospaceTable,
} from "../src/features/telegram/lib/telegram-html"

/**
 * A tabela monoespaçada é o único lugar do sistema onde uma cadeia de dinheiro
 * já formatada é MEXIDA depois de pronta. Estes testes guardam a regra que
 * tornou isso seguro: coluna com número nunca encurta.
 *
 * O defeito que eles existem para impedir era grave e silencioso: a versão
 * anterior encurtava qualquer coluna para caber na largura da tela, e
 * `(R$ 12.950,90)` chegava ao Telegram como `R$ 12.950,90)` — sem o parêntese
 * que marca o negativo. Um prejuízo de quase treze mil aparecia como ganho.
 */
describe("monospaceTable", () => {
  const MESES = ["Mês", "Entradas", "Saídas", "Resultado"]
  const LINHAS = [
    ["Junho/2026", "R$ 12.480,00", "R$ 9.833,42", "R$ 2.646,58"],
    ["Julho/2026", "R$ 11.200,00", "R$ 13.150,90", "(R$ 12.950,90)"],
  ]

  it("nenhum valor em dinheiro é cortado, mesmo sem caber na largura", () => {
    const table = monospaceTable(MESES, LINHAS)
    for (const valor of LINHAS.flat().filter((cell) => /\d/.test(cell))) {
      expect(table, valor).toContain(valor)
    }
  })

  it("o parêntese do negativo sobrevive — é ele que diz que é prejuízo", () => {
    const table = monospaceTable(MESES, LINHAS)
    expect(table).toContain("(R$ 12.950,90)")
    // O defeito antigo: sobrava o fecha-parêntese sem o abre.
    expect(table).not.toMatch(/[^(]R\$ 12\.950,90\)/)
  })

  it("encurta TEXTO, e avisa com reticências", () => {
    const table = monospaceTable(
      ["Descrição", "Valor"],
      [["Uma descrição bastante comprida de um lançamento qualquer", "R$ 10,00"]],
    )
    expect(table).toContain("…")
    expect(table).toContain("R$ 10,00")
  })

  it("a coluna do valor fica alinhada à direita", () => {
    const table = monospaceTable(["Item", "Valor"], [["A", "1,00"], ["B", "1.000,00"]])
    const [, , linhaA, linhaB] = table.split("\n")
    expect(linhaA.endsWith("1,00")).toBe(true)
    expect(linhaB.endsWith("1.000,00")).toBe(true)
    expect(linhaA.length).toBe(linhaB.length)
  })

  it("linha curta não vira tabela larga à toa", () => {
    const table = monospaceTable(["A", "B"], [["x", "1"]])
    expect(table.split("\n")).toHaveLength(3)
  })
})

describe("escape", () => {
  it("neutraliza o que quebraria a mensagem inteira", () => {
    // Sem isto, uma descrição com "<" faz o Telegram devolver 400 e a resposta
    // não chega — nem a parte boa dela.
    expect(escapeHtml('Conta <Luz> & Água')).toBe("Conta &lt;Luz&gt; &amp; Água")
  })

  it("o montador escapa o conteúdo, não a própria marcação", () => {
    expect(html.bold("Total <2026>")).toBe("<b>Total &lt;2026&gt;</b>")
    expect(html.pre("a < b")).toBe("<pre>a &lt; b</pre>")
  })
})
