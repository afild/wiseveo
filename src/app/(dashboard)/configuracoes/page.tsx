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
import { listPendingInvitations } from "@/features/settings/services/invitations-service"
import { resolveDataOwnerId } from "@/lib/data-owner"
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

  const invitationsEnabled = process.env.NEXT_PUBLIC_DEMO_MODE !== "true"
  const [settings, quickPaymentOptions, adminUsers, invitations, dataOwnerId] = await Promise.all([
    getUserSettings(userId),
    getQuickPaymentOptions(userId),
    isAdmin ? listUsersForAdmin() : Promise.resolve([]),
    isAdmin && invitationsEnabled ? listPendingInvitations(userId).catch(() => []) : Promise.resolve([]),
    resolveDataOwnerId(userId),
  ])
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
              dataOwnerId,
              invitations,
              invitationsEnabled,
            }
          : undefined
      }
    />
  )
}
