import { generateText, stepCountIs } from "ai";
import type { ToolSet } from "ai";
import { DEFAULT_LOCALE, LOCALE_META, type AppLocale } from "@/i18n/config";
import { formatAppDate } from "@/i18n/format";
import type { CardData } from "../types/telegram.types";
import type { HistoryMessage } from "./conversation-history.service";
import { aiGenerateText } from "@/features/ai/services/llm.service";

// NOTE: processUserQuery below is not currently wired into any active bot
// path — message-handler.service.ts drives the real flow via
// classifyQuery + dispatchQuery + formatCard/generateAnalystResponse instead.
// Kept for potential future use (single-pass LLM tool-calling loop); the
// i18n-ignored fallback strings are internal parse-failure constants never
// reached by a real Telegram user today.

function parseCardData(text: string): CardData {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { type: "error", headline: "Erro", insight: "Nao consegui estruturar a resposta." }; // i18n-ignore
  }

  const parsed = JSON.parse(jsonMatch[0]) as Partial<CardData>;
  const type = parsed.type ?? "summary";

  if (!["summary", "list", "category", "comparison", "single-value", "error"].includes(type)) {
    return { type: "error", headline: "Erro", insight: "Tipo de card invalido retornado pelo modelo." }; // i18n-ignore
  }

  return {
    type,
    eyebrow: parsed.eyebrow,
    headline: parsed.headline || "WISEVEO",
    value: parsed.value,
    trend: parsed.trend,
    insight: parsed.insight,
    progress: parsed.progress,
    items: parsed.items?.slice(0, 5).map((item) => ({
      label: item.label,
      value: item.value,
      detail: item.detail,
      progress: item.progress,
      tone: item.tone,
    })),
  };
}

export async function processUserQuery(
  query: string,
  tools: ToolSet,
  history: HistoryMessage[] = [],
  locale: AppLocale = DEFAULT_LOCALE,
): Promise<CardData> {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const currentMonthLabel = formatAppDate(today, "MMMM yyyy", locale)

  // LLM system-prompt instructions (content, not UI copy); output language is
  // enforced via the "Responda SEMPRE em" directive at the end. i18n-ignore
  const systemPrompt = `Você é o assistente financeiro do WISEVEO.
Hoje é ${todayStr}. Mês atual: ${currentMonthLabel}.

Sua tarefa é usar as ferramentas disponíveis para buscar dados financeiros reais e formatar uma resposta no seguinte formato JSON estrito:
{
  "type": "summary" | "list" | "category" | "comparison" | "single-value" | "error",
  "eyebrow": "Contexto curto opcional (ex: Maio 2026)",
  "headline": "Título curto (ex: Resumo Abril 2026)",
  "value": "Valor principal formatado com padrao brasileiro, sem prefixo monetario quando possivel (ex: 1.500,00) (opcional)",
  "trend": "Tendência curta (ex: 12% abaixo do mês passado) (opcional)",
  "insight": "Um insight útil em 1 ou 2 frases curtas (opcional)",
  "progress": 0-100 (opcional),
  "items": [{"label": "texto", "value": "valor formatado", "detail": "contexto curto", "progress": 0-100, "tone": "default" | "positive" | "negative" | "warning"}] (opcional, máx 5 itens)
}

REGRAS DE VALORES (crítico):
1. Use SEMPRE os valores retornados pelas tools (formattedTotal, formattedIncome, formattedExpense, formattedSavings etc). Nunca recalcule ou reformate valores numéricos.
2. Quando a tool retornar totalCount > shownCount, inclua no campo "insight" quantas transações existem no total (ex: "Exibindo as 5 maiores de 12 transações.").
3. Para resumo financeiro, use "type": "summary", coloque savings/economia como "value" principal e income/expense como "items".
4. Para listas de transações, use type "list" e inclua até 5 itens com data e categoria em "detail".
5. Para orçamento/categorias, use type "category" com progress quando houver percentual.

REGRAS DE FORMATO:
6. NÃO adicione \`\`\`json no início ou no fim — retorne apenas o objeto JSON puro.
7. Certifique-se de que é um JSON válido.
8. Chame as tools necessárias antes de responder.

REGRAS DE CONTEXTO:
9. Se faltar período na pergunta, use o mês atual.
10. Quando o usuário usar expressões como "esse período", "esse mês", "o mesmo", "anterior" — analise o histórico da conversa para inferir o contexto correto antes de assumir o mês atual.
11. Quando buscar por categoria/grupo e a tool retornar 0 transações, tente novamente usando o mesmo termo em "groupName" em vez de "categoryName" antes de concluir que não há dados.

MENSAGENS NÃO-FINANCEIRAS:
12. Para saudações, agradecimentos ou mensagens sem conteúdo financeiro, retorne SEMPRE este JSON (sem chamar tools):
{"type":"single-value","headline":"WISEVEO Bot","insight":"Olá! Pode me perguntar sobre suas finanças. Exemplo: 'Quanto gastei em supermercado em janeiro?' ou 'Qual meu resumo de abril?'"}

Responda SEMPRE em ${LOCALE_META[locale].label} (idioma do usuário) — inclusive headline, eyebrow, trend, insight e labels dos items.`

  const messages = [
    ...history,
    { role: "user" as const, content: query },
  ]

  // Pela porta única de IA: ela respeita o teto do mês, tenta o modelo de reserva
  // e MEDE o consumo de todos os passos (a chamada com tools vai ao modelo várias
  // vezes). Pegar os modelos crus aqui deixaria o gasto fora do medidor.
  const result = await aiGenerateText({
    tier: "smart",
    system: systemPrompt,
    messages,
    tools,
    stopWhen: stepCountIs(4),
  });

  return parseCardData(result.text);
}
