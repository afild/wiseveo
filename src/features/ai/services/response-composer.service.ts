import { LOCALE_META, type AppLocale } from "@/i18n/config"
import { aiGenerateObject } from "./llm.service"
import { runFinancialAgent, type FinancialAgentMessage } from "./financial-agent.service"
import {
  composedResponseSchema,
  isRenderableBlock,
  type ComposedResponse,
  type ResponseBlock,
} from "../types/response.types"
import type { AgentToolContext } from "../types/agent.types"

/**
 * QUEM DECIDE O FORMATO DA RESPOSTA É A IA.
 *
 * Antes, o formato era nosso: um card de molde fixo com três linhas e um
 * parágrafo curto de legenda. A IA só preenchia lacunas — e, sem material e sem
 * espaço, só podia repetir os números que já estavam desenhados.
 *
 * Agora ela recebe o material e escolhe: um card, uma tabela de trinta linhas,
 * parágrafos de análise, uma lista de pontos — na ordem que fizer sentido para a
 * pergunta. Nós desenhamos o que ela escolheu, em cada canal do jeito daquele
 * canal.
 *
 * Duas coisas continuam FORA do alcance dela, e são as duas que protegem a
 * verdade da resposta: os valores em dinheiro vêm prontos das ferramentas (ela
 * copia, nunca formata nem recalcula), e o layout é escolhido entre blocos que
 * sabemos desenhar — layout livre viraria card que não renderiza, e aí a pessoa
 * não receberia nada.
 */

/** Teto da composição. Uma tabela de 30 linhas com rótulos cabe folgada aqui. */
const COMPOSE_MAX_TOKENS = 4000
/** Passos de pesquisa do agente antes de compor. Era 6, e acabava antes de escrever. */
const RESEARCH_MAX_STEPS = 10

export interface ComposeContext extends AgentToolContext {
  /** Primeiro nome de quem vai ler. A resposta é para uma pessoa. */
  audience: string
}

function composerSystemPrompt(locale: AppLocale, audience: string): string {
  // Instruções para o MODELO (conteúdo e formato), não texto de UI. i18n-ignore
  return `Você é o analista financeiro pessoal do WISEVEO. Está montando a resposta que ${audience} vai ler no celular.

VOCÊ ESCOLHE O FORMATO. São cinco blocos; use os que quiser, quantos quiser, na ordem que quiser:
- "card": o quadro visual. Um destaque grande e as linhas que precisar (até 30 — o card cresce). Bom para o retrato de um período e para listas de até ~10 lançamentos.
- "table": tabela de até 4 colunas. Bom para listas longas, comparações mês a mês e rankings. Coluna com valor deve ser a ÚLTIMA, e rótulos curtos: a tabela é lida na tela de um celular.
- "chart": gráfico de barras deitadas, de 2 a 12 barras. Bom para comparar categorias, meses ou dias entre si — quando o QUE IMPORTA é a proporção, não o número exato. Cada barra leva o valor já formatado e um "weight" (qualquer número positivo na mesma escala) que só define o comprimento.
- "text": parágrafos de análise. É AQUI que você pensa, e é o que mais importa.
- "bullets": pontos curtos. Bom para achados e próximos passos.

COMO ANALISAR — o que se espera de você, e o que NÃO se espera:
- NÃO repita em texto o que já está no card ou na tabela. Quem lê já viu os números. Se o seu parágrafo só diz "as entradas foram X e as saídas Y", ele não deveria existir.
- Diga o que os números SIGNIFICAM: compare com o mês passado e com a média, aponte a categoria que puxou o resultado, separe o que é fato consumado do que ainda vai acontecer, e sinalize o que muda daqui a alguns dias.
- Quando algo estiver fora do padrão, diga o TAMANHO do desvio e o provável motivo, com base nos dados que você tem.
- Termine com o que fazer, quando houver algo a fazer. Uma frase, concreta. Se não houver, não invente tarefa.
- Fale com ${audience} pelo nome, uma vez, com naturalidade. Sem saudação cerimoniosa e sem "prezado".

REGRAS QUE NÃO SE NEGOCIAM:
- Dinheiro: use EXATAMENTE as cadeias já formatadas que vieram nos dados (os campos que começam com "formatted", ou os valores já escritos). Nunca recalcule, nunca reformate, nunca converta. Um valor entre parênteses JÁ significa negativo — não escreva "negativo" na frente dele.
- Não invente número, data, nome de categoria, conta ou loja. Se um dado não veio, diga que não foi possível apurar.
- Indicador com "state" diferente de "ok" significa dados insuficientes: diga isso, não afirme.
- Não dê conselho de investimento nem recomende produto financeiro.
- Sem markdown, sem HTML, sem asterisco: o texto dos blocos é texto puro.
- Escreva SEMPRE em ${LOCALE_META[locale].label}.`
}

function sanitize(response: ComposedResponse): ResponseBlock[] {
  return response.blocks.filter(isRenderableBlock)
}

/**
 * Compõe a partir de um dossiê que NÓS já levantamos (o caso dos boletins: a
 * hora de enviar é conhecida, os dados são sempre os mesmos, e buscá-los com
 * ferramentas seria pagar duas vezes pelo que já está na mão).
 */
export async function composeFromDossier(input: {
  dossier: string
  briefing: string
  ctx: ComposeContext
}): Promise<ResponseBlock[]> {
  const response = await aiGenerateObject({
    tier: "smart",
    schema: composedResponseSchema,
    system: composerSystemPrompt(input.ctx.locale, input.ctx.audience),
    // i18n-ignore: dados e pauta enviados ao MODELO
    prompt: `${input.briefing}\n\nDADOS APURADOS:\n${input.dossier}`,
    maxOutputTokens: COMPOSE_MAX_TOKENS,
  })

  return sanitize(response)
}

/**
 * Compõe a resposta de uma PERGUNTA. Duas idas ao modelo, de propósito:
 *
 * 1. O agente pesquisa com as ferramentas — é ele quem sabe o que precisa
 *    buscar, e agora tem passos suficientes para buscar mais de uma coisa.
 * 2. O compositor transforma o que foi apurado em blocos.
 *
 * Numa ida só não daria: o SDK não aceita ferramentas junto com saída
 * estruturada. E separar tem uma vantagem — o passo 1 pode gastar quantos passos
 * precisar sem arriscar devolver um JSON pela metade.
 */
export async function composeAnswer(input: {
  dataOwnerId: string
  question: string
  history?: FinancialAgentMessage[]
  ctx: ComposeContext
}): Promise<ResponseBlock[]> {
  const research = await runFinancialAgent({
    dataOwnerId: input.dataOwnerId,
    question: input.question,
    history: input.history,
    ctx: input.ctx,
    maxSteps: RESEARCH_MAX_STEPS,
  })

  const response = await aiGenerateObject({
    tier: "smart",
    schema: composedResponseSchema,
    system: composerSystemPrompt(input.ctx.locale, input.ctx.audience),
    // i18n-ignore: pauta enviada ao MODELO
    prompt: `PERGUNTA DE ${input.ctx.audience}: ${input.question}

O QUE VOCÊ JÁ APUROU NOS DADOS DELE:
${research.text}

Monte agora a resposta em blocos. Se apurou uma lista de lançamentos, mostre a lista — não resuma em "foram N lançamentos". Se apurou números de períodos diferentes, compare-os.`,
    maxOutputTokens: COMPOSE_MAX_TOKENS,
  })

  return sanitize(response)
}
