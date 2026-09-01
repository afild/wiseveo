import { getTranslations } from "next-intl/server"
import { getUserSettings } from "@/features/settings/services/user-settings-service"
import {
  defaultQuickPaymentSettings,
  getQuickPaymentOptions,
} from "@/features/settings/services/user-settings-service"
import { ConfiguracoesPageClient } from "@/features/settings/components/configuracoes-page-client"
import { getSettingsUserId } from "@/features/settings/services/get-settings-user-id"
import {
  getUserAdminAccess,
  listUsersForAdmin,
} from "@/features/settings/services/admin-users-service"
import { readSharedAccountStructure } from "@/features/settings/services/shared-account-service"
import { readAppSettingsStructure } from "@/features/settings/services/app-settings-service"
import { getUserNotificationSettings } from "@/features/settings/services/user-settings-service"
import { prisma } from "@/lib/prisma"
import { getTelegramBotStatus } from "@/features/telegram/services/telegram-config.service"
import { getAiStatusSummary } from "@/features/ai/services/ai-config.service"
import { getMonthUsage } from "@/features/ai/services/ai-usage.service"
import { getTickSecretStatus } from "@/features/notifications/services/tick-secret.service"
import { getAccountOwnership } from "@/features/settings/services/admin-users-service"
import { listPendingInvitations } from "@/features/settings/services/invitations-service"
import { defaultMonetarySettings } from "@/lib/monetary"
import {
  demoAdminShowcase,
  demoAppSettingsStructure,
  demoIntegrationsContext,
  demoNotificationPreferences,
} from "@/features/settings/lib/demo-showcase"

const baseTabs = ["general", "appearance", "monetary", "profile", "account"] as const
type SettingsTab = (typeof baseTabs)[number] | "notifications" | "integrations" | "admin"

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>
}) {
  const userId = await getSettingsUserId()
  const resolvedSearchParams = await searchParams
  const requestedTab = resolvedSearchParams?.tab
  const { isAdmin } = await getUserAdminAccess(userId)

  if (!userId) {
    const t = await getTranslations("common")
    return (
      <div className="flex items-center justify-center h-96 px-4 md:px-6">
        <p className="text-muted-foreground">
          {t("noUserFound")}
        </p>
      </div>
    )
  }

  // Convites não existem na demo; fora dela, o dono precisa saber se o banco já foi
  // preparado (a estrutura só entra com a confirmação dele).
  const invitationsEnabled = process.env.NEXT_PUBLIC_DEMO_MODE !== "true"
  const [settings, quickPaymentOptions, adminUsers, sharedAccount, ownership] = await Promise.all([
    getUserSettings(userId),
    getQuickPaymentOptions(userId),
    isAdmin ? listUsersForAdmin() : Promise.resolve([]),
    isAdmin && invitationsEnabled ? readSharedAccountStructure().catch(() => null) : Promise.resolve(null),
    isAdmin ? getAccountOwnership(userId).catch(() => null) : Promise.resolve(null),
  ])
  // Convites só depois de o banco estar preparado — antes disso a tabela nem existe.
  const invitations =
    sharedAccount?.ready && isAdmin ? await listPendingInvitations(userId).catch(() => []) : []
  const currentUser = adminUsers.find((u) => u.id === userId)

  // Integrações (bot do Telegram; adiante, IA): o bot é da INSTALAÇÃO — só o
  // SUPERADMIN vê a aba; na demo ela não existe, como os convites.
  const showIntegrations =
    currentUser?.role === "SUPERADMIN" && process.env.NEXT_PUBLIC_DEMO_MODE !== "true"
  const [telegramBot, aiSummary, aiUsage, tickStatus] = showIntegrations
    ? await Promise.all([
        getTelegramBotStatus().catch(() => null),
        getAiStatusSummary().catch(() => null),
        getMonthUsage().catch(() => null),
        getTickSecretStatus().catch(() => null),
      ])
    : [null, null, null, null]

  // Avisos automáticos são de CADA PESSOA (o bot é da casa, o boletim é de quem
  // pediu). Na demo, como tudo que depende do Telegram, a aba não existe.
  const showNotifications = process.env.NEXT_PUBLIC_DEMO_MODE !== "true"
  // A estrutura do banco é lida uma vez e serve às DUAS abas: quem não é
  // SUPERADMIN não vê o cartão de preparo, mas precisa saber se os avisos já
  // têm onde ser registrados — senão ligaria tudo e não receberia nada.
  const [appSettings, notificationPreferences, telegramConnection] =
    showNotifications || showIntegrations
      ? await Promise.all([
          readAppSettingsStructure().catch(() => null),
          showNotifications ? getUserNotificationSettings(userId) : Promise.resolve(null),
          showNotifications
            ? prisma.telegramConnection
                .findUnique({ where: { userId }, select: { isActive: true } })
                .catch(() => null)
            : Promise.resolve(null),
        ])
      : [null, null, null]

  // DEMO ilustrativa: as três abas escondidas aparecem com dados FICTÍCIOS e
  // tudo somente-leitura. Nenhum caminho do APP muda: fora da demo os contextos
  // continuam vindo do banco, como sempre.
  const isDemoShowcase = process.env.NEXT_PUBLIC_DEMO_MODE === "true"
  const demoAdmin = isDemoShowcase ? demoAdminShowcase(userId) : null

  const validTabs: string[] = [
    ...baseTabs,
    ...(showNotifications || isDemoShowcase ? ["notifications"] : []),
    ...(showIntegrations || isDemoShowcase ? ["integrations"] : []),
    ...(isAdmin || isDemoShowcase ? ["admin"] : []),
  ]
  const initialTab: SettingsTab =
    requestedTab && validTabs.includes(requestedTab) ? (requestedTab as SettingsTab) : "general"

  return (
    <ConfiguracoesPageClient
      initialTab={initialTab}
      isAdmin={isAdmin || isDemoShowcase}
      demoShowcase={isDemoShowcase}
      notificationsContext={
        isDemoShowcase
          ? {
              preferences: demoNotificationPreferences(),
              telegramConnected: true,
              ledgerReady: true,
            }
          : showNotifications && notificationPreferences
            ? {
                preferences: notificationPreferences,
                telegramConnected: Boolean(telegramConnection?.isActive),
                // O cartão do preparo é do SUPERADMIN; aqui só interessa se o
                // caderno de envios já existe — sem ele o relógio não manda nada.
                ledgerReady: appSettings?.notificationsReady ?? false,
              }
            : undefined
      }
      integrationsContext={
        isDemoShowcase
          ? { ...demoIntegrationsContext(), structure: demoAppSettingsStructure() }
          : showIntegrations
            ? {
                structure: appSettings,
                bot: telegramBot ?? { configured: false, source: null, botUsername: null },
                ai:
                  aiSummary && aiUsage
                    ? {
                        providers: aiSummary.providers,
                        compatibleBaseUrl: aiSummary.compatibleBaseUrl,
                        models: aiSummary.models,
                        budget: aiSummary.budget,
                        usage: { period: aiUsage.period, calls: aiUsage.calls, costUsd: aiUsage.costUsd },
                      }
                    : null,
                tick: tickStatus,
              }
            : undefined
      }
      initialQuickPaymentSettings={
        settings?.general.quickPayment ?? defaultQuickPaymentSettings
      }
      quickPaymentOptions={quickPaymentOptions}
      initialMonetarySettings={settings?.monetary ?? defaultMonetarySettings}
      initialAdminUsers={demoAdmin ? demoAdmin.users : adminUsers}
      adminContext={
        demoAdmin
          ? demoAdmin.context
          : isAdmin && currentUser
            ? {
                currentUserId: userId,
                currentUserRole: currentUser.role,
                sharedAccount,
                invitations,
                ownerId: ownership?.ownerId ?? userId,
                memberIds: ownership?.memberIds ?? [],
              }
            : undefined
      }
    />
  )
}
