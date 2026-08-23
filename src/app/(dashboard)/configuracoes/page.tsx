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
import { getAccountOwnership } from "@/features/settings/services/admin-users-service"
import { listPendingInvitations } from "@/features/settings/services/invitations-service"
import { defaultMonetarySettings } from "@/lib/monetary"

const baseTabs = ["general", "appearance", "monetary", "profile", "account"] as const
type SettingsTab = (typeof baseTabs)[number] | "admin"

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>
}) {
  const userId = await getSettingsUserId()
  const resolvedSearchParams = await searchParams
  const requestedTab = resolvedSearchParams?.tab
  const { isAdmin } = await getUserAdminAccess(userId)
  const validTabs = isAdmin ? [...baseTabs, "admin"] : [...baseTabs]
  const initialTab: SettingsTab =
    requestedTab && (validTabs as readonly string[]).includes(requestedTab)
    ? (requestedTab as SettingsTab)
    : "general"

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

  return (
    <ConfiguracoesPageClient
      initialTab={initialTab}
      isAdmin={isAdmin}
      initialQuickPaymentSettings={
        settings?.general.quickPayment ?? defaultQuickPaymentSettings
      }
      quickPaymentOptions={quickPaymentOptions}
      initialMonetarySettings={settings?.monetary ?? defaultMonetarySettings}
      initialAdminUsers={adminUsers}
      adminContext={
        isAdmin && currentUser
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
