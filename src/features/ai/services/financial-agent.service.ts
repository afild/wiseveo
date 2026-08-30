import { stepCountIs } from "ai"
import type { ModelMessage } from "ai"
import { LOCALE_META, type AppLocale } from "@/i18n/config"
import { formatAppDate } from "@/i18n/format"
import { getAgentTools } from "../tools"
import type { AgentToolContext } from "../types/agent.types"
import { aiGenerateText } from "./llm.service"

/**
 * O agente financeiro: recebe a pergunta em linguagem natural e decide SOZINHO
 * quais dados buscar, usando as ferramentas de leitura.
 *
 * Ele é o MOTOR DE PESQUISA da resposta — o levantamento. Quem transforma isso
 * no que a pessoa lê é `response-composer.service.ts`, que escolhe entre card,
 * tabela, gráfico e texto. Foi assim que a resposta deixou de ser "2 a 5
 * frases": o limite de tamanho vivia aqui e estrangulava a análise.
 *
 * É o motor — não conhece canal nenhum. O Telegram o chama hoje; a página
 * Advisor e os boletins chamam o mesmo daqui a pouco. Quem chama passa o
 * contexto (idioma, moeda) e recebe TEXTO pronto para enviar.
 *
 * Roda no nível AVANÇADO: é aqui que a análise de verdade acontece. As
 * perguntas simples continuam no caminho barato (classificador + card).
 */

export interface FinancialAgentMessage {
  role: "user" | "assistant"
  content: string
}

export interface FinancialAgentInput {
  /** Dono dos DADOS consultados (pode diferir de quem pergunta, em conta compartilhada). */
  dataOwnerId: string
  question: string
  /** Conversa recente, para "e em dezembro?" fazer sentido. */
  history?: FinancialAgentMessage[]
  ctx: AgentToolContext
  /** Quantos passos de ferramenta o agente pode dar antes de responder. */
  maxSteps?: number
}

const DEFAULT_MAX_STEPS = 6
/** Teto do fecho de emergência: é para concluir com o que já se sabe. */
const WRAP_UP_MAX_TOKENS = 1200

/** Pedido final quando os passos acabaram sem resposta escrita. */
const WRAP_UP_INSTRUCTION =
  // i18n-ignore: instrução para o MODELO, não é texto de UI
  "Responda agora, com o que você já levantou. Não chame mais ferramentas. Se faltou algum dado, diga o que conseguiu apurar e o que não deu para verificar."

export function buildFinancialAgentSystemPrompt(locale: AppLocale, now = new Date()): string {
  const todayIso = now.toISOString().slice(0, 10)
  const todayLabel = formatAppDate(now, "PPPP", locale)

  // Instruções para o MODELO (conteúdo), não texto de UI. O idioma da RESPOSTA
  // é imposto pela última diretriz. i18n-ignore
  return `Você é o analista financeiro pessoal do WISEVEO. Responde a quem é dono destes dados, sobre o dinheiro DELE.

Hoje é ${todayLabel} (${todayIso}).

COMO TRABALHAR
1. Busque os dados com as ferramentas ANTES de responder. Nunca responda de memória, nunca estime o que dá para consultar.
2. Pergunta sobre uma categoria, conta ou loja específica ("gastei muito com lazer?", "quanto gastei no mercado?"): chame get_chart_of_accounts ANTES de buscar. Os nomes são os que o dono cadastrou — podem estar em outro idioma ou com outra palavra. Busca por nome que volta vazia NÃO é resposta: ache o nome real e refaça a busca.
3. Pergunta ampla sobre a situação ("como estou?", "posso gastar?") → get_financial_insights. Ela é cara: no máximo uma vez.
4. Comparações entre meses e tendências → get_monthly_flows. Um mês específico → get_financial_summary ou get_dre.
5. Sem período na pergunta, use o mês atual. "Este mês" vai do dia 1 até hoje.

O QUE NUNCA FAZER
- Não invente números, datas nem nomes. Se o dado não veio, diga que não encontrou.
- NUNCA afirme que algo não existe ("você não teve gastos com X") por causa de uma busca por nome vazia. Só depois de conferir os nomes reais em get_chart_of_accounts; se ainda assim não achar, diga que não encontrou NADA COM ESSE NOME, e não que não houve gasto.
- Pergunta que não é sobre o dinheiro desta pessoa? Responda em uma frase que você só cuida das finanças dela, SEM chamar ferramenta nenhuma.
- Use SEMPRE os valores já formatados que as ferramentas devolvem (campos que começam com "formatted"). Nunca recalcule nem reformate dinheiro por conta própria.
- Nos indicadores, cada item traz "state": se não for "ok", os dados são insuficientes — diga isso em vez de afirmar.
- Não dê conselho de investimento nem recomende produtos financeiros. Você analisa o que já aconteceu e o que está agendado.

O QUE ENTREGAR
Você é o LEVANTAMENTO, não a resposta final: quem escreve o que a pessoa lê é outro passo, e ele só terá o que você trouxer.
- Traga TODOS os números que apurou, com os valores EXATAMENTE como as ferramentas devolveram (os campos "formatted"). Não resuma "foram 12 lançamentos": liste os 12.
- Traga também o que você concluiu: comparações, o que puxou o resultado, o que está fora do padrão e por quê.
- Diga o que NÃO conseguiu apurar, e por quê. Silêncio vira invenção no passo seguinte.
- Sem preocupação com tamanho ou beleza: é material de trabalho, não a mensagem.
- Escreva em ${LOCALE_META[locale].label}.`
}

export interface FinancialAgentResult {
  text: string
  /** Quantas idas ao modelo — útil para diagnóstico e para medir custo. */
  steps: number
}

export async function runFinancialAgent(input: FinancialAgentInput): Promise<FinancialAgentResult> {
  const tools = getAgentTools(input.dataOwnerId, input.ctx)
  const system = buildFinancialAgentSystemPrompt(input.ctx.locale)
  const messages: ModelMessage[] = [
    ...(input.history ?? []).map((message) => ({
      role: message.role,
      content: message.content,
    })),
    { role: "user" as const, content: input.question },
  ]

  const result = await aiGenerateText({
    tier: "smart",
    system,
    messages,
    tools,
    stopWhen: stepCountIs(input.maxSteps ?? DEFAULT_MAX_STEPS),
  })

  const steps = result.steps?.length ?? 1
  const answer = result.text.trim()
  if (answer) return { text: answer, steps }

  // O agente gastou todos os passos buscando dados e parou ANTES de escrever a
  // resposta — o último passo foi uma chamada de ferramenta, então não há texto.
  // Sem isto, a pessoa receberia "não entendi" depois da consulta mais cara do
  // sistema. Uma última ida ao modelo, agora SEM ferramentas, obriga a concluir
  // com o que já foi levantado.
  // As `tools` vão JUNTO mesmo sem intenção de usá-las: a transcrição reenviada
  // contém chamadas de ferramenta, e provedor que recebe histórico de ferramenta
  // sem a declaração correspondente recusa o pedido inteiro — a pessoa ficaria
  // sem resposta logo depois da consulta mais cara do sistema. O `stepCountIs(1)`
  // impede que este passo comece uma nova rodada de buscas, e o teto de saída
  // existe porque aqui é para concluir, não para recomeçar.
  const wrapUp = await aiGenerateText({
    tier: "smart",
    system,
    tools,
    stopWhen: stepCountIs(1),
    maxOutputTokens: WRAP_UP_MAX_TOKENS,
    messages: [...messages, ...result.response.messages, { role: "user", content: WRAP_UP_INSTRUCTION }],
  })

  return { text: wrapUp.text.trim(), steps: steps + 1 }
}
