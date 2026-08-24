import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSettingsUserId } from "@/features/settings/services/get-settings-user-id"
import { forgetTelegramConversation } from "@/features/telegram/services/conversation-history.service"

export async function DELETE() {
  const userId = await getSettingsUserId()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // deleteMany: desconectar sem vínculo existente é um sucesso vazio, não um erro
  // (o delete simples estourava P2025 → 500 num clique repetido).
  await prisma.telegramConnection.deleteMany({
    where: { userId },
  })

  // A conversa vai junto: o mesmo chat pode ser vinculado por outra pessoa
  // depois, e o histórico é contexto que o agente repassa ao modelo.
  await forgetTelegramConversation(userId)

  return NextResponse.json({ success: true })
}
