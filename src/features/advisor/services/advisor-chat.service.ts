import crypto from "crypto"
import { prisma } from "@/lib/prisma"
import type { FinancialAgentMessage } from "@/features/ai/services/financial-agent.service"

/**
 * As conversas da página Advisor, guardadas em `advisor_messages` (uma linha por
 * mensagem). A tabela nasce pelo "Preparar meu banco" — e, se ainda não existir,
 * NADA quebra: o Advisor responde normalmente, só não lembra depois.
 *
 * Tolerância estreita, no padrão do resto do app: só "tabela ausente" degrada;
 * qualquer outro erro sobe.
 */

const MAX_HISTORY_MESSAGES = 20

function isTableMissing(error: unknown): boolean {
  return Boolean(error) && (error as { code?: string }).code === "P2021"
}

export function newConversationId(): string {
  return crypto.randomUUID()
}

export interface AdvisorStoredMessage {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: string
}

/**
 * As mensagens MAIS RECENTES da conversa, devolvidas da mais antiga para a mais
 * nova (é assim que a tela e o agente esperam).
 *
 * Buscar em ordem crescente com limite traria as PRIMEIRAS mensagens: a conversa
 * congelaria nas trocas iniciais para sempre. Por isso busca decrescente e
 * inverte. O desempate por `id` importa porque pergunta e resposta são gravadas
 * no mesmo milissegundo — sem ele, a ordem entre as duas seria indefinida.
 */
export async function getConversation(
  userId: string,
  conversationId: string,
): Promise<AdvisorStoredMessage[]> {
  try {
    const rows = (
      await prisma.advisorMessage.findMany({
        where: { userId, conversationId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: MAX_HISTORY_MESSAGES,
      })
    ).reverse()
    return rows.map((row) => ({
      id: row.id,
      role: row.role === "assistant" ? "assistant" : "user",
      content: row.content,
      createdAt: row.createdAt.toISOString(),
    }))
  } catch (error) {
    if (isTableMissing(error)) return []
    throw error
  }
}

/** A conversa mais recente da pessoa (é a que a página reabre). */
export async function getLatestConversationId(userId: string): Promise<string | null> {
  try {
    const last = await prisma.advisorMessage.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { conversationId: true },
    })
    return last?.conversationId ?? null
  } catch (error) {
    if (isTableMissing(error)) return null
    throw error
  }
}

/** Grava a pergunta e a resposta. Sem tabela, segue sem guardar. */
export async function appendToConversation(input: {
  userId: string
  conversationId: string
  question: string
  answer: string
}): Promise<void> {
  try {
    await prisma.advisorMessage.createMany({
      data: [
        {
          userId: input.userId,
          conversationId: input.conversationId,
          role: "user",
          content: input.question,
        },
        {
          userId: input.userId,
          conversationId: input.conversationId,
          role: "assistant",
          content: input.answer,
        },
      ],
    })
  } catch (error) {
    if (isTableMissing(error)) return
    // Guardar é acessório: a resposta já foi dada, não vale derrubá-la por isto.
    console.error("[ADVISOR] Failed to persist conversation:", error)
  }
}

/** Apaga uma conversa inteira (botão "começar de novo"). */
export async function deleteConversation(userId: string, conversationId: string): Promise<void> {
  try {
    await prisma.advisorMessage.deleteMany({ where: { userId, conversationId } })
  } catch (error) {
    if (isTableMissing(error)) return
    throw error
  }
}

/** O histórico no formato que o agente entende. */
export function toAgentHistory(messages: AdvisorStoredMessage[]): FinancialAgentMessage[] {
  return messages.map((message) => ({ role: message.role, content: message.content }))
}
