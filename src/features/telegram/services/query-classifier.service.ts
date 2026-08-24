import { z } from "zod"
import { aiGenerateObject, AiNotConfiguredError } from "@/features/ai/services/llm.service"
import { AiBudgetExceededError } from "@/features/ai/services/ai-usage.service"
import { DEFAULT_LOCALE, LOCALE_META, type AppLocale } from "@/i18n/config"
import type { HistoryMessage, TelegramConversationMemoryState } from "./conversation-history.service"

export type QueryIntent =
  | "financial_summary"
  | "spending_by_payee"
  | "transaction_search"
  | "transaction_list"
  | "account_balance"
  | "budget"
  | "dre"
  | "calendar_day"
  | "upcoming"
  | "recurring"
  | "financial_analysis"
  | "unknown"

export interface ClassifiedQuery {
  intent: QueryIntent
  /**
   * `true` quando o intent é "unknown" porque o CLASSIFICADOR FALHOU (provedor
   * fora do ar, resposta fora do formato) — e não porque a pergunta não se
   * encaixou. Quem chama usa isso para não escalar uma falha técnica ao agente
   * caro: o modelo que falhou é justamente o que o agente também usaria.
   */
  classifierFailed?: boolean
  period?: { from: string; to: string }
  groupName?: string
  categoryName?: string
  payeeName?: string
  accountName?: string
  transactionType?: "INCOME" | "EXPENSE" | "TRANSFER"
  status?: "PAID" | "PENDING" | "OVERDUE" | "SCHEDULED"
  date?: string
  limit?: number
  searchText?: string
}

const VALID_INTENTS = [
  "financial_summary",
  "spending_by_payee",
  "transaction_search",
  "transaction_list",
  "account_balance",
  "budget",
  "dre",
  "calendar_day",
  "upcoming",
  "recurring",
  "financial_analysis",
  "unknown",
] as const satisfies readonly QueryIntent[]

// Saída ESTRUTURADA (generateObject): o modelo é obrigado a devolver este formato —
// acabou o "caçar JSON com regex" que quebrava em silêncio ao trocar de modelo.
//
// `nullable` e NÃO `optional`: o modo estrito de saída estruturada da OpenAI (ligado
// por padrão) exige que TODA chave apareça na lista de obrigatórias — campo opcional
// vira esquema recusado e a pergunta morre antes de chegar ao banco. Nulo é o "não
// informado" aqui, e vira ausente em `toClassifiedQuery`.
export const classificationSchema = z.object({
  intent: z.enum(VALID_INTENTS),
  period: z.object({ from: z.string(), to: z.string() }).nullable(),
  groupName: z.string().nullable(),
  categoryName: z.string().nullable(),
  payeeName: z.string().nullable(),
  accountName: z.string().nullable(),
  transactionType: z.enum(["INCOME", "EXPENSE", "TRANSFER"]).nullable(),
  status: z.enum(["PAID", "PENDING", "OVERDUE", "SCHEDULED"]).nullable(),
  date: z.string().nullable(),
  limit: z.number().nullable(),
  searchText: z.string().nullable(),
})

/** Nulo do modelo = campo não informado (o resto do fluxo espera ausência). */
const orUndefined = <T,>(value: T | null): T | undefined => value ?? undefined

function toClassifiedQuery(raw: z.infer<typeof classificationSchema>): ClassifiedQuery {
  return {
    intent: raw.intent,
    period: orUndefined(raw.period),
    groupName: orUndefined(raw.groupName),
    categoryName: orUndefined(raw.categoryName),
    payeeName: orUndefined(raw.payeeName),
    accountName: orUndefined(raw.accountName),
    transactionType: orUndefined(raw.transactionType),
    status: orUndefined(raw.status),
    date: orUndefined(raw.date),
    limit: orUndefined(raw.limit),
    searchText: orUndefined(raw.searchText),
  }
}

// Detection data (Portuguese keyword lists driving the regex-based extraction
// heuristics below) — not UI copy. The LLM classification itself is
// multilingual; these regexes are a fast-path/refinement layer that only
// engages for Portuguese phrasing, degrading gracefully for other locales.
const MONTH_WORDS = // i18n-ignore
  "janeiro|jan|fevereiro|fev|marco|março|mar|abril|abr|maio|mai|junho|jun|julho|jul|agosto|ago|setembro|set|outubro|out|novembro|nov|dezembro|dez"

const EXPENSE_QUERY_RE = /\bquanto\s+(?:eu\s+)?gastei\b/i
const GROUPING_QUERY_RE =
  /\b(por\s+(?:loja|lojas|benefici[aá]rio|beneficiarios|beneficiários|estabelecimento|estabelecimentos|fornecedor|fornecedores)|onde\s+mais\s+gastei|ranking|top\s+\d*|maiores\s+gastos|agrupad[ao]s?)\b/i
const EXPENSE_SEARCH_RE = new RegExp(
  // i18n-ignore
  String.raw`\bquanto\s+(?:eu\s+)?gastei\s+(?:em|com|no|na|nos|nas|do|da|dos|das|de)\s+(.+?)(?=\s+(?:em|este|esta|esse|essa|neste|nesta|nesse|nessa|m[eê]s|ano|semana|hoje|ontem|amanh[aã]|${MONTH_WORDS}|20\d{2}|\d{1,2}\/\d{2,4})\b|[?!.,;:]|$)`,
  "i",
)
const PERIOD_DATE_RE = /^(?:20\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{4}-\d{2}(?:-\d{2})?)$/
const RELATIVE_PERIOD_RE =
  /^(?:hoje|ontem|amanha|este mes|esse mes|mes atual|esta semana|essa semana|este ano|esse ano)$/

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function cleanSearchCandidate(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/["'`´“”‘’]/g, "")
    .replace(/[?!.,;:]+$/g, "")
    .trim()
}

function isPeriodOnlyCandidate(value: string) {
  const normalized = normalizeText(value)
  if (PERIOD_DATE_RE.test(normalized) || RELATIVE_PERIOD_RE.test(normalized)) {
    return true
  }
  return new RegExp(String.raw`^(?:${MONTH_WORDS})(?:\s+de\s+\d{2,4})?$`, "i").test(normalized)
}

function extractExpenseSearchText(query: string) {
  const match = EXPENSE_SEARCH_RE.exec(query.replace(/\s+/g, " "))
  const candidate = match?.[1] ? cleanSearchCandidate(match[1]) : ""

  if (!candidate || isPeriodOnlyCandidate(candidate)) return undefined
  return candidate
}

function normalizeExpenseQuery(query: string, classified: ClassifiedQuery): ClassifiedQuery {
  if (!EXPENSE_QUERY_RE.test(query) || GROUPING_QUERY_RE.test(query)) {
    return classified
  }

  const extractedSearchText = extractExpenseSearchText(query)
  const fallbackSearchText =
    classified.searchText || classified.payeeName || classified.groupName || classified.categoryName
  const searchText = extractedSearchText || fallbackSearchText

  if (!searchText && classified.intent !== "spending_by_payee") {
    return {
      ...classified,
      transactionType: classified.transactionType ?? "EXPENSE",
    }
  }

  return {
    ...classified,
    intent: "transaction_search",
    searchText,
    transactionType: "EXPENSE",
    payeeName: undefined,
    groupName: undefined,
    categoryName: undefined,
  }
}

export async function classifyQuery(
  query: string,
  history: HistoryMessage[] = [],
  memory?: TelegramConversationMemoryState,
  locale: AppLocale = DEFAULT_LOCALE,
): Promise<ClassifiedQuery> {
  const todayStr = new Date().toISOString().slice(0, 10)

  const recentContext = history
    .filter((m) => m.role === "user")
    .slice(-2)
    .map((m) => `- ${m.content}`)
    .join("\n")

  const contextSection = recentContext ? `\nContexto recente:\n${recentContext}` : ""
  // LLM prompt content (data recap), not UI copy.
  const memorySection = memory // i18n-ignore
    ? `\nMemória persistente:
- Última intenção: ${memory.lastIntent ?? "nenhuma"}
- Último período: ${
        memory.lastPeriod ? `${memory.lastPeriod.from} a ${memory.lastPeriod.to}` : "nenhum"
      }
- Últimos filtros: ${JSON.stringify(memory.lastFilters ?? {})}
- Última pergunta sobre lançamentos: ${memory.lastTransactionQuestion ?? "nenhuma"}`
    : ""

  // LLM system-prompt instructions (content, not UI copy). This classifier
  // only ever outputs structured JSON, so there is no natural-language
  // "output language" to enforce — the directive below instead clarifies
  // that category/group taxonomy stays in Portuguese (system data)
  // regardless of the language the user's question is written in. i18n-ignore
  const systemPrompt = `Classificador de perguntas financeiras do WISEVEO. Hoje: ${todayStr}. Idioma do usuário: ${LOCALE_META[locale].label}.${contextSection}${memorySection}

TODAS as chaves são obrigatórias: preencha null no que não se aplicar (nunca omita).
Datas (period.from/period.to/date) sempre no formato YYYY-MM-DD.

Intents disponíveis:
- financial_summary: resumo do período ("resumo do mês", "total de entradas", "quanto economizei", "balanço")
- spending_by_payee: gastos agrupados por loja ou beneficiário quando a pergunta pedir "por loja", "por beneficiário", "onde mais gastei" ou ranking
- transaction_search: Busca de lançamentos individuais, totais simples ou contagem ("quanto gastei com cigarros", "lançamentos do Nubank", "encontre o cafezinho"). Use para consultas que não exijam análise temporal profunda.
- financial_analysis: Análise histórica, comparações entre meses, busca de máximos/mínimos no tempo ("Qual mês...", "Qual ano...", "Quando foi o maior..."), tendências ou perguntas de "Quanto já gastei no total" que impliquem visão histórica ampla.
- account_balance: Consultas sobre saldos das contas bancárias ("qual meu saldo", "saldo das contas")
- budget: orçamento mensal ("orçamento", "quanto resta", "estouro de orçamento")
- dre: demonstrativo de resultados ("DRE", "demonstrativo")
- calendar_day: extrato de um dia específico ("extrato de hoje", "lançamentos do dia 15")
- upcoming: próximas contas a pagar/receber ("contas a vencer", "próximos pagamentos", "o que vence")
- recurring: transações recorrentes ("assinaturas", "contas fixas", "recorrentes")
- unknown: não relacionado a finanças ou impossível de classificar

Regras de período:
- "DEZ/25" → from:"2025-12-01", to:"2025-12-31"
- "Novembro de 25" → from:"2025-11-01", to:"2025-11-30"
- "janeiro" sem ano → use o ano mais recente plausível dado o contexto
- Sem período informado → period: null
- Use o contexto recente para inferir "esse período", "o mesmo mês" etc.

Regras de categorias e grupos:
- Mapeie termos do usuário para categorias do sistema em SINGULAR se possível ("supermercados" -> categoryName: "supermercado").
- As categorias/grupos do sistema estão sempre em português, mesmo se a pergunta do usuário estiver em outro idioma (ex: "supermarkets" em inglês -> categoryName: "supermercado"). Nunca traduza categoryName/groupName para o idioma do usuário.
- Se o usuário pedir "gastos com X", e X parecer uma categoria, use categoryName.
- Se a pergunta pedir ranking/top/maiores gastos ("quais os 3 supermercados...", "onde mais gastei"), use intent: "spending_by_payee".

Regras de busca literal:
- Para perguntas sobre lançamentos individuais ou totais simples, prefira transaction_search.
- searchText deve ser copiado literalmente do usuário, sem sinônimos, sem tradução, sem singular/plural inventado.
- Se o usuário escreveu "cigarros", use "cigarros"; se escreveu "cigarro", use "cigarro".
- Se a pergunta envolver uma pessoa ou termo específico em uma categoria (ex: "Salário da Faby"), coloque "Salário" em categoryName e "Faby" em searchText.
- Se a pergunta for "e em dezembro?", reaproveite searchText e filtros da memória persistente, alterando apenas o período.
- "quanto gastei" implica transactionType:"EXPENSE".
- Em "quanto gastei em/com/no/na/de X", use X como searchText literal quando X não for apenas período.
- "quanto recebi" implica transactionType:"INCOME".`

  try {
    const object = await aiGenerateObject({
      tier: "fast",
      schema: classificationSchema,
      system: systemPrompt,
      prompt: query,
      maxOutputTokens: 300,
    })
    return normalizeExpenseQuery(query, toClassifiedQuery(object))
  } catch (e) {
    // Teto estourado e IA não configurada sobem para o canal AVISAR o que houve —
    // degradar para "não entendi" faria o bot fingir burrice a cada mensagem, sem
    // ninguém descobrir que falta a chave. O resto degrada como antes.
    if (e instanceof AiBudgetExceededError || e instanceof AiNotConfiguredError) throw e
    console.error("Query classifier failed:", e)
    return { intent: "unknown", classifierFailed: true }
  }
}
