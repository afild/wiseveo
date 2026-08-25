import { NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import { prisma } from "@/lib/prisma"
import { getSessionUserId } from "@/lib/session"
import {
  getUserNotificationSettings,
  updateUserNotificationSettings,
} from "@/features/settings/services/user-settings-service"
import { readAppSettingsStructure } from "@/features/settings/services/app-settings-service"

/**
 * Os avisos automáticos de QUEM ESTÁ LOGADO. Cada pessoa manda no que recebe —
 * ao contrário do bot e das chaves de IA, que são da instalação e só o
 * SUPERADMIN configura. Na demo a rota não existe.
 */

export const dynamic = "force-dynamic"

function demoOff(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true"
}

async function readSupport(userId: string) {
  const [connection, structure] = await Promise.all([
    prisma.telegramConnection.findUnique({
      where: { userId },
      select: { isActive: true },
    }),
    readAppSettingsStructure().catch(() => null),
  ])

  return {
    telegramConnected: Boolean(connection?.isActive),
    // Sem o caderno de envios o relógio não manda nada: a tela avisa em vez de
    // deixar a pessoa ligar tudo e não receber nada.
    ledgerReady: structure?.notificationsReady ?? false,
  }
}

export async function GET() {
  if (demoOff()) return new NextResponse(null, { status: 404 })

  const t = await getTranslations("api.errors")
  const userId = await getSessionUserId()
  if (!userId) {
    return NextResponse.json({ success: false, message: t("notAuthenticated") }, { status: 401 })
  }

  try {
    const [preferences, support] = await Promise.all([
      getUserNotificationSettings(userId),
      readSupport(userId),
    ])
    return NextResponse.json({ success: true, data: { preferences, ...support } })
  } catch (error) {
    console.error("[NOTIFICATIONS] read settings failed:", error)
    return NextResponse.json({ success: false, message: t("internalError") }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  if (demoOff()) return new NextResponse(null, { status: 404 })

  const t = await getTranslations("api.errors")
  const userId = await getSessionUserId()
  if (!userId) {
    return NextResponse.json({ success: false, message: t("notAuthenticated") }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => null)
    // O normalizador é a régua: campo inválido cai no padrão em vez de recusar o
    // formulário inteiro — e nada fora da régua entra no banco.
    const preferences = await updateUserNotificationSettings(userId, body)
    const support = await readSupport(userId)
    return NextResponse.json({ success: true, data: { preferences, ...support } })
  } catch (error) {
    console.error("[NOTIFICATIONS] save settings failed:", error)
    return NextResponse.json({ success: false, message: t("internalError") }, { status: 500 })
  }
}
