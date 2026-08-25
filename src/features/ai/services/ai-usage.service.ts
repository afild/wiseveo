import { prisma } from "@/lib/prisma"
import { estimateCostMicroUsd, microUsdToUsd } from "../lib/catalog"
import { getAiConfig } from "./ai-config.service"

/**
 * Consumo de IA (tabela `ai_usage`): cada chamada soma tokens e custo ESTIMADO no
 * mês/provedor/modelo, com incrementos atômicos. O teto mensal lê daqui.
 *
 * Tolerância estreita (padrão data-owner): tabela ausente = instalação ainda não
 * preparada → não conta, não bloqueia, não quebra. Chave por env sem banco
 * preparado continua funcionando como sempre — só fica sem medidor.
 */

export class AiBudgetExceededError extends Error {
  constructor(public readonly limitUsd: number) {
    // i18n-ignore: erro interno tipado; quem mostra ao usuário traduz no canal
    super("AI monthly budget exceeded")
    this.name = "AiBudgetExceededError"
  }
}

function isTableMissing(error: unknown): boolean {
  return Boolean(error) && (error as { code?: string }).code === "P2021"
}

/** "202608" — a chave do mês corrente (UTC, igual nos servidores). */
export function currentPeriod(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`
}

export interface AiUsageInput {
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
}

export async function recordAiUsage(usage: AiUsageInput): Promise<void> {
  await recordAiUsageCost(usage)
}

/**
 * Igual a `recordAiUsage`, mas aceita um custo já calculado — é o caso da
 * transcrição, cobrada por MINUTO de áudio e não por token.
 */
export async function recordAiUsageCost(
  usage: Partial<AiUsageInput> & { provider: string; model: string; costMicroUsd?: bigint },
): Promise<void> {
  const period = currentPeriod()
  const inputTokens = Math.max(0, Math.round(usage.inputTokens || 0))
  const outputTokens = Math.max(0, Math.round(usage.outputTokens || 0))
  const cost = usage.costMicroUsd ?? estimateCostMicroUsd(usage.model, inputTokens, outputTokens)
  try {
    await prisma.aiUsage.upsert({
      where: {
        period_provider_model: { period, provider: usage.provider, model: usage.model },
      },
      create: {
        period,
        provider: usage.provider,
        model: usage.model,
        calls: 1,
        inputTokens: BigInt(inputTokens),
        outputTokens: BigInt(outputTokens),
        costMicroUsd: cost,
      },
      update: {
        calls: { increment: 1 },
        inputTokens: { increment: BigInt(inputTokens) },
        outputTokens: { increment: BigInt(outputTokens) },
        costMicroUsd: { increment: cost },
      },
    })
  } catch (error) {
    if (isTableMissing(error)) return
    // Medidor nunca derruba a resposta: registra e segue.
    console.error("[AI USAGE] record failed:", error)
  }
}

export interface AiMonthUsage {
  period: string
  calls: number
  inputTokens: number
  outputTokens: number
  costUsd: number
}

export async function getMonthUsage(period: string = currentPeriod()): Promise<AiMonthUsage> {
  try {
    const result = await prisma.aiUsage.aggregate({
      where: { period },
      _sum: { calls: true, inputTokens: true, outputTokens: true, costMicroUsd: true },
    })
    return {
      period,
      calls: result._sum.calls ?? 0,
      inputTokens: Number(result._sum.inputTokens ?? BigInt(0)),
      outputTokens: Number(result._sum.outputTokens ?? BigInt(0)),
      costUsd: microUsdToUsd(result._sum.costMicroUsd ?? BigInt(0)),
    }
  } catch (error) {
    if (isTableMissing(error)) {
      return { period, calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 }
    }
    throw error
  }
}

// O gasto do mês muda devagar; 60s de cache evitam uma soma no banco por mensagem.
const BUDGET_CACHE_TTL_MS = 60_000
let budgetCache: { period: string; costUsd: number; at: number } | null = null

export function invalidateAiBudgetCache() {
  budgetCache = null
}

/**
 * Barreira do teto: chamada ANTES de cada uso de IA. SEM teto = campo vazio
 * (null); teto ZERO é um teto de verdade — pausa a IA na hora (quem digita 0
 * quer justamente isso, e a tela promete "vazio = sem teto").
 * Teto batido → `AiBudgetExceededError` (cada canal traduz o aviso).
 */
export async function assertWithinAiBudget(): Promise<void> {
  const { budget } = await getAiConfig()
  const limit = budget.monthlyLimitUsd
  if (limit === null || limit < 0) return

  const period = currentPeriod()
  if (!budgetCache || budgetCache.period !== period || Date.now() - budgetCache.at > BUDGET_CACHE_TTL_MS) {
    const usage = await getMonthUsage(period)
    budgetCache = { period, costUsd: usage.costUsd, at: Date.now() }
  }

  if (budgetCache.costUsd >= limit) {
    throw new AiBudgetExceededError(limit)
  }
}
