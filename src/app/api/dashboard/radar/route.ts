import { NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"

import { getRadarSnapshot } from "@/features/radar/services/get-radar-snapshot"
import { getUserRadarPreferences } from "@/features/settings/services/user-settings-service"
import { getDefaultUserId } from "@/features/transactions/services/get-default-user-id"

export const dynamic = "force-dynamic"

/**
 * Tudo que a bolinha da barra lateral precisa, numa chamada: as preferências do dono e o
 * retrato já calculado. A janela vem da preferência gravada, não de parâmetro do cliente,
 * então não há como pedir um intervalo arbitrário por aqui.
 */
export async function GET() {
  const t = await getTranslations("api.errors")
  const userId = await getDefaultUserId()

  if (!userId) {
    return NextResponse.json({ error: t("userNotFound") }, { status: 401 })
  }

  const preferences = await getUserRadarPreferences(userId)
  const snapshot = await getRadarSnapshot(userId, preferences.horizonDays, new Date())

  return NextResponse.json({ preferences, ...snapshot })
}
