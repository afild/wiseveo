import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSettingsUserId } from "@/features/settings/services/get-settings-user-id"

export async function DELETE() {
  const userId = await getSettingsUserId()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // deleteMany: desconectar sem vínculo existente é um sucesso vazio, não um erro
  // (o delete simples estourava P2025 → 500 num clique repetido).
  await prisma.telegramConnection.deleteMany({
    where: { userId },
  })

  return NextResponse.json({ success: true })
}
