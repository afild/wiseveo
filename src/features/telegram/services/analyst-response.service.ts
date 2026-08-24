import { aiGenerateText } from "@/features/ai/services/llm.service"
import { LOCALE_META, type AppLocale } from "@/i18n/config"
import type { ClassifiedQuery } from "./query-classifier.service"
import type { DispatchResult } from "./tool-dispatcher.service"

export async function generateAnalystResponse(
  userQuery: string,
  classified: ClassifiedQuery,
  dispatched: DispatchResult,
  locale: AppLocale,
): Promise<string> {
  const dataStr = JSON.stringify(dispatched.data, null, 2)

  // Análise de verdade usa o nível AVANÇADO (o econômico fica para classificar).
  const { text } = await aiGenerateText({
    tier: "smart",
    // LLM system-prompt instructions (content, not UI copy); output language
    // is enforced via the "Responda SEMPRE em" directive below. i18n-ignore
    system: `Você é um Analista Financeiro Senior do WISEVEO.
Seu trabalho é interpretar os dados financeiros fornecidos e responder à pergunta do usuário de forma clara, assertiva e natural.

DIRETRIZES:
- Se o usuário perguntar "Qual mês...", "Quando...", identifique o mês com maior/menor valor nos dados fornecidos.
- Se houver uma tendência (ex: gastos aumentando), mencione-a brevemente.
- Use um tom profissional mas amigável.
- Responda SEMPRE em ${LOCALE_META[locale].label}.
- Mantenha a resposta concisa e direta ao ponto.
- Se os dados (history) estiverem vazios, informe gentilmente que não encontrou registros para essa análise no período (últimos 12 meses por padrão).
- Não invente dados ou meses. Use apenas o que consta em "DADOS DA ANÁLISE".
- Se houver nomes de pessoas (ex: "Faby"), use o nome na resposta para ser mais pessoal.

DADOS DA ANÁLISE (Agregados Mensais):
${dataStr}`,
    // i18n-ignore: LLM prompt label, not UI copy
    prompt: `Pergunta do Usuário: "${userQuery}"`,
  })

  return text.trim()
}
