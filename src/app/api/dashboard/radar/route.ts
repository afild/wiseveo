import { NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"

import { getRadarSnapshot } from "@/features/radar/services/get-radar-snapshot"
import { getSettingsUserId } from "@/features/settings/services/get-settings-user-id"
import { getUserRadarPreferences } from "@/features/settings/services/user-settings-service"
import { getDefaultUserId } from "@/features/transactions/services/get-default-user-id"

export const dynamic = "force-dynamic"

/**
 * Tudo que a bolinha da barra lateral precisa, numa chamada: as preferências de quem está
 * olhando e o retrato já calculado. A janela vem da preferência gravada, não de parâmetro do
 * cliente, então não há como pedir um intervalo arbitrário por aqui.
 *
 * Dois ids, de propósito. Em conta compartilhada o DINHEIRO é do dono dos dados
 * (`getDefaultUserId`, que passa por `resolveDataOwnerId`), mas a PREFERÊNCIA é de quem está
 * usando (`getSettingsUserId`), como manda o docblock de `src/lib/data-owner.ts`. Ler as duas
 * pelo mesmo id faria a pessoa convidada ajustar o radar em Configurações e não ver mudança
 * nenhuma na tela, porque a preferência dela seria ignorada em favor da do dono.
 */
export async function GET() {
  const t = await getTranslations("api.errors")
  const [dataUserId, personUserId] = await Promise.all([
    getDefaultUserId(),
    getSettingsUserId(),
  ])

  if (!dataUserId || !personUserId) {
    return NextResponse.json({ error: t("userNotFound") }, { status: 401 })
  }

  const preferences = await getUserRadarPreferences(personUserId)
  const snapshot = await getRadarSnapshot(dataUserId, preferences.horizonDays, new Date())

  return NextResponse.json({ preferences, ...snapshot })
}
