import { NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import { canAccessSetup } from "@/lib/setup-access"
import {
  fetchBotIdentity,
  isValidBotTokenFormat,
} from "@/features/telegram/services/telegram-config.service"

/**
 * Passo Integrações do wizard: valida o token colado perguntando ao Telegram quem
 * é o bot (getMe). SEM estado — nada é gravado aqui (o banco da instalação ainda
 * nem está conectado); quem grava é o /api/setup/configure, no Finalizar.
 * Mesmo guardião das demais rotas do Setup: instalação concluída → só SUPERADMIN.
 */
export async function POST(req: Request) {
  if (!(await canAccessSetup())) return new NextResponse(null, { status: 404 })
  const t = await getTranslations("api.telegramBot")

  const body = (await req.json().catch(() => null)) as { token?: unknown } | null
  const token = typeof body?.token === "string" ? body.token.trim() : ""

  if (!isValidBotTokenFormat(token)) {
    return NextResponse.json({ success: false, code: "invalidToken", message: t("invalidToken") }, { status: 400 })
  }

  const identity = await fetchBotIdentity(token)
  if (!identity.ok) {
    return NextResponse.json(
      { success: false, code: identity.code, message: t(identity.code) },
      { status: identity.code === "network" ? 502 : 400 },
    )
  }

  return NextResponse.json({
    success: true,
    data: { botUsername: identity.botUsername, botName: identity.botName },
  })
}
