import { NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import { getSessionUserId } from "@/lib/session"
import { deleteConversation } from "@/features/advisor/services/advisor-chat.service"

/**
 * Apagar a conversa do Advisor.
 *
 * A conversa é guardada para o "e em dezembro?" da mensagem seguinte fazer
 * sentido — e é justamente por isso que precisa existir um jeito de começar do
 * zero: um fio longo demais atrapalha, e o assunto de ontem não deveria
 * contaminar a pergunta de hoje.
 *
 * Só apaga a conversa de QUEM ESTÁ LOGADO: o identificador vem da sessão, nunca
 * do corpo do pedido.
 */
export const dynamic = "force-dynamic"

export async function DELETE(req: Request) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return new NextResponse(null, { status: 404 })
  }

  const t = await getTranslations("api.errors")
  const userId = await getSessionUserId()
  if (!userId) {
    return NextResponse.json({ success: false, message: t("notAuthenticated") }, { status: 401 })
  }

  try {
    const body = (await req.json().catch(() => null)) as { conversationId?: unknown } | null
    const conversationId = typeof body?.conversationId === "string" ? body.conversationId : ""
    if (!conversationId) {
      return NextResponse.json({ success: false, message: t("invalidJson") }, { status: 400 })
    }

    await deleteConversation(userId, conversationId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[ADVISOR] delete conversation failed:", error)
    return NextResponse.json({ success: false, message: t("internalError") }, { status: 500 })
  }
}
