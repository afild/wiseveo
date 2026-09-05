import { describe, expect, it } from "vitest"
import { parseInline, parseRichText } from "../src/features/legal/lib/rich-text"

/**
 * A política de privacidade é um documento longo que mora nos arquivos de tradução,
 * como qualquer outro texto do app. Para ele caber ali sem virar cem chaves soltas,
 * cada seção é UMA string com três marcas: parágrafo em branco, `- ` para item de
 * lista, `**negrito**` e `[texto](url)`.
 *
 * Este é o tradutor dessas marcas para blocos. Ele é minúsculo de propósito: nada de
 * markdown completo, só o que o documento usa.
 */
describe("parseInline", () => {
  it("texto simples vira um pedaço só", () => {
    expect(parseInline("uma frase comum")).toEqual([{ kind: "text", text: "uma frase comum" }])
  })

  it("negrito no meio da frase", () => {
    expect(parseInline("guardamos seu **nome e e-mail** aqui")).toEqual([
      { kind: "text", text: "guardamos seu " },
      { kind: "strong", text: "nome e e-mail" },
      { kind: "text", text: " aqui" },
    ])
  })

  it("link com texto próprio", () => {
    expect(parseInline("veja em [myaccount](https://myaccount.google.com/permissions).")).toEqual([
      { kind: "text", text: "veja em " },
      { kind: "link", text: "myaccount", href: "https://myaccount.google.com/permissions" },
      { kind: "text", text: "." },
    ])
  })

  it("negrito e link convivem na mesma frase", () => {
    const nos = parseInline("**Apagar tudo:** escreva ou use [o painel](https://exemplo.test)")
    expect(nos.map((n) => n.kind)).toEqual(["strong", "text", "link"])
  })

  it("endereço fora de http, https ou mailto vira texto, nunca link", () => {
    // Os textos vêm dos nossos arquivos de tradução, mas um link não é lugar para
    // aceitar qualquer esquema: `javascript:` num href é o caminho clássico de XSS.
    expect(parseInline("clique [aqui](javascript:alert)")).toEqual([
      { kind: "text", text: "clique " },
      { kind: "text", text: "aqui" },
    ])
    expect(parseInline("[x](data:text/html,oi)").some((n) => n.kind === "link")).toBe(false)
  })

  it("marca sozinha não quebra o texto", () => {
    expect(parseInline("dois ** asteriscos soltos")).toEqual([{ kind: "text", text: "dois ** asteriscos soltos" }])
  })
})

describe("parseRichText", () => {
  it("linha em branco separa parágrafos", () => {
    const blocos = parseRichText("primeiro parágrafo\n\nsegundo parágrafo")
    expect(blocos).toHaveLength(2)
    expect(blocos.every((b) => b.kind === "paragraph")).toBe(true)
  })

  it("bloco de linhas iniciadas por hífen vira lista", () => {
    const blocos = parseRichText("Os cookies são:\n\n- um de sessão;\n- um de idioma.")
    expect(blocos[0].kind).toBe("paragraph")
    expect(blocos[1]).toEqual({
      kind: "list",
      items: [[{ kind: "text", text: "um de sessão;" }], [{ kind: "text", text: "um de idioma." }]],
    })
  })

  it("hífen no meio de uma frase não vira lista", () => {
    const blocos = parseRichText("conta a conta - tudo junto")
    expect(blocos[0].kind).toBe("paragraph")
  })

  it("texto vazio não gera bloco nenhum", () => {
    expect(parseRichText("")).toEqual([])
    expect(parseRichText("\n\n  \n\n")).toEqual([])
  })

  it("o documento inteiro atravessa sem perder texto", () => {
    const corpo = "Início **forte**.\n\n- item um\n- item [dois](https://exemplo.test)\n\nFim."
    const plano = parseRichText(corpo)
      .flatMap((b) => (b.kind === "list" ? b.items.flat() : b.content))
      .map((n) => n.text)
      .join("")
    expect(plano).toBe("Início forte.item umitem doisFim.")
  })
})
