import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"

import { AdvisorClient } from "@/features/advisor/components/advisor-client"
import {
  getConversation,
  getLatestConversationId,
  newConversationId,
} from "@/features/advisor/services/advisor-chat.service"
import { getAdvisorOpening } from "@/features/advisor/services/advisor-opening.service"
import { readAppSettingsStructure } from "@/features/settings/services/app-settings-service"
import { getSettingsUserId } from "@/features/settings/services/get-settings-user-id"
import { getUserMonetarySettings } from "@/features/settings/services/user-settings-service"
import { createMonetaryFormatter } from "@/lib/monetary"
import { resolveDataOwnerId } from "@/lib/data-owner"

/** Os dados são de agora; nada de página guardada em cache. */
export const dynamic = "force-dynamic"

export default async function AdvisorPage() {
  // Na demo o Advisor não existe (mesmo padrão dos convites e das integrações).
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") notFound()

  const userId = await getSettingsUserId()
  if (!userId) {
    const t = await getTranslations("common")
    return (
      <div className="flex h-96 items-center justify-center px-4 lg:px-6">
        <p className="text-muted-foreground">{t("noUserFound")}</p>
      </div>
    )
  }

  // Moeda e conversas são de QUEM PERGUNTA; os números são de quem é DONO dos
  // dados (em conta compartilhada, os dois diferem — o resto do app já faz assim,
  // e a rota do chat logo ali também).
  const [monetarySettings, structure, latestConversationId, dataOwnerId] = await Promise.all([
    getUserMonetarySettings(userId),
    readAppSettingsStructure().catch(() => null),
    getLatestConversationId(userId).catch(() => null),
    resolveDataOwnerId(userId),
  ])

  const conversationId = latestConversationId ?? newConversationId()
  const [opening, messages] = await Promise.all([
    getAdvisorOpening(dataOwnerId, createMonetaryFormatter(monetarySettings)),
    latestConversationId ? getConversation(userId, latestConversationId) : Promise.resolve([]),
  ])

  return (
    <div className="flex flex-1 flex-col px-4 pt-0 lg:px-6">
      <AdvisorClient
        opening={opening}
        conversationId={conversationId}
        initialMessages={messages}
        conversationsPersisted={structure?.advisorReady === true}
      />
    </div>
  )
}
