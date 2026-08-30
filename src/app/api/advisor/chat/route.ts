import { NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import { getSettingsUserId } from "@/features/settings/services/get-settings-user-id"
import { getUserLocale, getUserMonetarySettings } from "@/features/settings/services/user-settings-service"
import { resolveDataOwnerId } from "@/lib/data-owner"
import { createMonetaryFormatter } from "@/lib/monetary"
import { composeAnswer } from "@/features/ai/services/response-composer.service"
import { blocksToPlainText } from "@/features/ai/types/response.types"
import { prisma } from "@/lib/prisma"
import { AiNotConfiguredError } from "@/features/ai/services/llm.service"
import { AiBudgetExceededError } from "@/features/ai/services/ai-usage.service"
import {
  appendToConversation,
  getConversation,
  toAgentHistory,
} from "@/features/advisor/services/advisor-chat.service"

/** O agente pode dar vários passos de ferramenta antes de responder. */
export const maxDuration = 120
export const dynamic = "force-dynamic"

const MAX_QUESTION_LENGTH = 1000

/**
 * Uma pergunta da página Advisor. Mesmo agente do Telegram — o canal muda, o
 * motor não. Na demo a rota não existe.
 */
export async function POST(req: Request) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return new NextResponse(null, { status: 404 })

  const t = await getTranslations("api.advisor")

  const userId = await getSettingsUserId()
  if (!userId) {
    const tErrors = await getTranslations("api.errors")
    return NextResponse.json({ success: false, message: tErrors("notAuthenticated") }, { status: 401 })
  }

  try {
    const body = (await req.json().catch(() => null)) as {
      question?: unknown
      conversationId?: unknown
    } | null
    const question = typeof body?.question === "string" ? body.question.trim() : ""
    const conversationId = typeof body?.conversationId === "string" ? body.conversationId : ""

    if (!question || !conversationId) {
      return NextResponse.json({ success: false, message: t("invalidQuestion") }, { status: 400 })
    }
    if (question.length > MAX_QUESTION_LENGTH) {
      return NextResponse.json({ success: false, message: t("questionTooLong") }, { status: 400 })
    }

    // Idioma e moeda são de quem pergunta; os DADOS são de quem é dono deles.
    const [locale, dataOwnerId] = await Promise.all([getUserLocale(userId), resolveDataOwnerId(userId)])
    const [tAgent, monetarySettings, previous] = await Promise.all([
      getTranslations({ locale, namespace: "telegram" }),
      getUserMonetarySettings(userId),
      getConversation(userId, conversationId),
    ])

    // Mesmo motor e mesmo compositor do Telegram: quem pergunta na página tem
    // direito à mesma profundidade de quem pergunta no celular.
    const person = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
    const blocks = await composeAnswer({
      dataOwnerId,
      question,
      history: toAgentHistory(previous),
      ctx: {
        t: tAgent,
        locale,
        monetary: createMonetaryFormatter(monetarySettings),
        viewerId: userId,
        audience: (person?.name ?? "").trim().split(/\s+/)[0] ?? "",
      },
    })

    const answer = blocksToPlainText(blocks) || t("emptyAnswer")
    await appendToConversation({ userId, conversationId, question, answer })

    return NextResponse.json({ success: true, data: { answer, blocks } })
  } catch (error) {
    if (error instanceof AiBudgetExceededError) {
      return NextResponse.json({ success: false, message: t("budgetExceeded") }, { status: 429 })
    }
    if (error instanceof AiNotConfiguredError) {
      return NextResponse.json({ success: false, message: t("notConfigured") }, { status: 503 })
    }
    console.error("[ADVISOR] chat failed:", error)
    const tErrors = await getTranslations("api.errors")
    return NextResponse.json({ success: false, message: tErrors("internalError") }, { status: 500 })
  }
}
