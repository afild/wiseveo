import { describe, expect, it } from "vitest"
import { buildFinancialAgentSystemPrompt } from "../src/features/ai/services/financial-agent.service"
import { LOCALES, LOCALE_META } from "../src/i18n/config"
import { proposedTransactionSchema } from "../src/features/ai/tools/write-transaction.tool"

/**
 * O agente escreve o que a pessoa lê. As promessas que ele não pode quebrar
 * moram nas instruções — e é isso que estes testes guardam.
 */
describe("instruções do agente", () => {
  it("diz a data de hoje, para não errar 'este mês'", () => {
    const prompt = buildFinancialAgentSystemPrompt("pt-BR", new Date(Date.UTC(2026, 7, 24)))
    expect(prompt).toContain("2026-08-24")
  })

  it("manda responder no idioma do usuário, nos três idiomas", () => {
    for (const locale of LOCALES) {
      const prompt = buildFinancialAgentSystemPrompt(locale, new Date(Date.UTC(2026, 7, 24)))
      expect(prompt, locale).toContain(LOCALE_META[locale].label)
    }
  })

  it("proíbe inventar dado e mandar recalcular dinheiro", () => {
    const prompt = buildFinancialAgentSystemPrompt("pt-BR", new Date(Date.UTC(2026, 7, 24)))
    expect(prompt).toMatch(/Não invente/i)
    expect(prompt).toMatch(/formatted/)
    expect(prompt).toMatch(/state/)
  })

  it("proíbe conselho de investimento (não somos consultor licenciado)", () => {
    const prompt = buildFinancialAgentSystemPrompt("pt-BR", new Date(Date.UTC(2026, 7, 24)))
    expect(prompt).toMatch(/investimento/i)
  })

  it("pede LEVANTAMENTO completo, não a resposta final", () => {
    // A regra antiga era "2 a 5 frases, é conversa de mensagem". Ela vivia aqui
    // e estrangulava a análise: o agente virou o motor de PESQUISA, e quem
    // escreve o que a pessoa lê é o compositor (response-composer.service.ts).
    // Se alguém reintroduzir limite de tamanho aqui, a resposta volta a ser rasa.
    const prompt = buildFinancialAgentSystemPrompt("pt-BR", new Date(Date.UTC(2026, 7, 24)))
    expect(prompt).toMatch(/levantamento/i)
    expect(prompt).toMatch(/liste/i)
    expect(prompt).not.toMatch(/2 a 5 frases/i)
  })
})

/**
 * A ferramenta de ESCRITA existe desenhada, mas não pode estar ligada antes da
 * Etapa 5: o agente nunca grava sem a confirmação do dono.
 */
describe("ferramenta de lançar transação (desligada até a Etapa 5)", () => {
  it("NÃO está no conjunto que o agente realmente recebe", async () => {
    const { getAgentTools } = await import("../src/features/ai/tools")
    // Contexto de mentira: só precisamos das CHAVES do conjunto, e montá-lo não
    // toca no banco (as ferramentas só consultam quando executadas).
    const ctx = {
      t: ((key: string) => key) as never,
      locale: "pt-BR" as const,
      monetary: { formatNumberValue: (v: number) => String(v) } as never,
    }
    const names = Object.keys(getAgentTools("user-de-teste", ctx))

    expect(names.length).toBeGreaterThan(0)
    expect(names).toContain("get_financial_insights")
    // Nenhuma ferramenta que escreva pode estar aqui antes da Etapa 5.
    for (const name of names) {
      expect(name, name).not.toMatch(/propose|write|create|update|delete|pay/i)
    }
  })

  it("todas as ferramentas do agente são de leitura", async () => {
    const { getAgentTools } = await import("../src/features/ai/tools")
    const ctx = {
      t: ((key: string) => key) as never,
      locale: "pt-BR" as const,
      monetary: { formatNumberValue: (v: number) => String(v) } as never,
    }
    // Toda ferramenta de DADO começa com "get_" — é leitura, e é contrato com o
    // modelo. A exceção é nominal e única: `set_card_theme` grava a cor dos
    // quadros de quem lê. Não toca em dinheiro, e está aqui escrita para que
    // acrescentar uma segunda escrita exija passar por este teste.
    const escritasPermitidas = ["set_card_theme"]
    for (const name of Object.keys(getAgentTools("user-de-teste", ctx))) {
      if (escritasPermitidas.includes(name)) continue
      expect(name, name).toMatch(/^get_/)
    }
  })

  it("a proposta exige nomes reais de conta e categoria", () => {
    const parsed = proposedTransactionSchema.safeParse({
      date: "2026-08-24",
      amount: 42.5,
      type: "EXPENSE",
      description: "café",
      accountName: "Nubank",
      categoryName: "Alimentação",
      payeeName: null,
      statusName: null,
    })
    expect(parsed.success).toBe(true)
  })

  it("recusa proposta sem conta ou sem categoria", () => {
    const incomplete = {
      date: "2026-08-24",
      amount: 42.5,
      type: "EXPENSE",
      description: "café",
      payeeName: null,
      statusName: null,
    }
    expect(proposedTransactionSchema.safeParse(incomplete).success).toBe(false)
  })
})
