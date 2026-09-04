import { NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import crypto from "crypto"
import { prisma } from "@/lib/prisma"
import { getSessionUserId } from "@/lib/session"
import { getTelegramBotConfig } from "@/features/telegram/services/telegram-config.service"

export async function POST() {
  const t = await getTranslations("api")

  const config = await getTelegramBotConfig()
  if (!config) {
    return NextResponse.json({ error: t("telegram.notConfigured") }, { status: 503 })
  }

  try {
    // Escrita de dados da pessoa: identidade só da sessão. O atalho de leitura cai no usuário mais antigo fora de produção.
    const userId = await getSessionUserId()
    if (!userId) {
      return NextResponse.json({ error: t("errors.notAuthenticated") }, { status: 401 })
    }

    // Expurgo oportunista: tokens vencidos ou já usados não servem para nada e a
    // tabela crescia sem limite. Barato — roda junto de cada novo pedido de vínculo.
    await prisma.telegramPendingToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: new Date() } }, { used: true }] },
    })

    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 min

    await prisma.telegramPendingToken.create({
      data: { token, userId, expiresAt },
    })

    // O deepLink carrega o token de vínculo: nunca vai para log.
    const deepLink = `https://t.me/${config.botUsername}?start=${token}`

    return NextResponse.json({ token, deepLink })
  } catch (error) {
    console.error("[Telegram Connect] Error:", error)
    return NextResponse.json({ error: t("errors.internalError") }, { status: 500 })
  }
}
