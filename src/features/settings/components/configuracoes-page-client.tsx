"use client"

import React from "react"
import { useSearchParams } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { type MonetarySettings } from "@/lib/monetary"
import type {
  QuickPaymentOptions,
  QuickPaymentSettings,
} from "../services/user-settings-service"
import type { AdminUserSummary } from "../services/admin-users-service"
import type { SharedAccountStructure } from "../lib/shared-account-structure"
import type { InvitationSummary } from "../services/invitations-service"
import { GeneralForm } from "./general-form"
import { AppearanceForm } from "./appearance-form"
import { MonetaryFormatForm } from "./monetary-format-form"
import { ProfileForm } from "./profile-form"
import { AccountForm } from "./account-form"
import { AdminUsersForm } from "./admin-users-form"
import { IntegrationsForm, type TelegramBotSummary } from "./integrations-form"
import { NotificationsForm } from "./notifications-form"
import type { NotificationPreferences } from "@/features/notifications/lib/preferences"
import type { AiSettingsSnapshot } from "./ai-settings-card"
import type { TickSecretView } from "./tick-settings-card"
import type { BackupSettingsView } from "./backup-settings-card"
import type { AppSettingsStructure } from "../lib/app-settings-structure"
import { PartyPopper } from "lucide-react"
import { useTranslations } from "next-intl"
import { DemoShowcaseBanner } from "@/components/demo-showcase-banner"
import { SecurityForm } from "@/features/security/components/security-form"
import type { SecurityContext } from "@/features/security/lib/security-context"

interface ConfiguracoesPageClientProps {
  initialTab?:
    | "general"
    | "appearance"
    | "monetary"
    | "profile"
    | "account"
    | "notifications"
    | "integrations"
    | "admin"
    | "security"
  isAdmin: boolean
  /** Demo ilustrativa: abas extras com dados fictícios e tudo somente-leitura. */
  demoShowcase?: boolean
  initialQuickPaymentSettings: QuickPaymentSettings
  quickPaymentOptions: QuickPaymentOptions
  initialMonetarySettings: MonetarySettings
  initialAdminUsers: AdminUserSummary[]
  /** Aba Avisos (todo mundo, fora da demo): boletins, sentinela e lembrete. */
  notificationsContext?: {
    preferences: NotificationPreferences
    telegramConnected: boolean
    ledgerReady: boolean
  }
  /** Aba Integrações (só SUPERADMIN, fora da demo): preparo do banco + bot + IA. */
  integrationsContext?: {
    structure: AppSettingsStructure | null
    bot: TelegramBotSummary
    ai: AiSettingsSnapshot | null
    tick: TickSecretView | null
    backup: BackupSettingsView | null
  }
  /**
   * Aba Segurança (qualquer sessão real): estado do fechamento e do PIN. Vem da SESSÃO, nunca de
   * `demoShowcase` — a env vale tanto para a vitrine quanto para a cópia do visitante, e o
   * visitante manda na cópia dele.
   */
  securityContext?: SecurityContext
  /** Contexto da aba Usuários (só quando isAdmin). */
  adminContext?: {
    currentUserId: string
    currentUserRole: "USER" | "ADMIN" | "SUPERADMIN"
    sharedAccount: SharedAccountStructure | null
    invitations: InvitationSummary[]
    ownerId: string
    memberIds: string[]
  }
}

export function ConfiguracoesPageClient({
  initialTab = "general",
  isAdmin,
  demoShowcase = false,
  initialQuickPaymentSettings,
  quickPaymentOptions,
  initialMonetarySettings,
  initialAdminUsers,
  notificationsContext,
  integrationsContext,
  securityContext,
  adminContext,
}: ConfiguracoesPageClientProps) {
  const searchParams = useSearchParams()
  const isOnboarding = searchParams.get("onboarding") === "true"
  const t = useTranslations("settings")

  return (
    <div className="flex-1 space-y-6 px-4 lg:px-6 pt-0">
      
      {isOnboarding && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex gap-4 items-start max-w-3xl animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="p-2 bg-primary/20 rounded-full shrink-0">
            <PartyPopper className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-primary">{t("onboardingSuccess")}</h3>
            <p className="text-sm text-muted-foreground mt-1" dangerouslySetInnerHTML={{ __html: t("onboardingDesc") }} />
          </div>
        </div>
      )}

      <Tabs defaultValue={initialTab} className="space-y-6">
        {/* `max-w-full` segura as larguras fixas do `xl`: numa tela de 1440 com a barra lateral
            aberta o container tem ~1113px, e sem o teto as 9 abas empurrariam a página para o lado.
            `h-auto` porque abaixo do `lg` a grade tem várias linhas e a altura fixa do TabsList
            (h-9) deixava as últimas abas por cima do conteúdo. */}
        <TabsList
          className={`grid h-auto w-full max-w-full grid-cols-2 gap-2 sm:grid-cols-3 lg:h-9 ${
            {
              5: "lg:w-full lg:grid-cols-5 xl:w-[720px]",
              6: "lg:w-full lg:grid-cols-6 xl:w-[840px]",
              7: "lg:w-full lg:grid-cols-7 xl:w-[960px]",
              8: "lg:w-full lg:grid-cols-8 xl:w-[1080px]",
              9: "lg:w-full lg:grid-cols-9 xl:w-[1200px]",
            }[
              5 +
                (notificationsContext ? 1 : 0) +
                (integrationsContext ? 1 : 0) +
                (isAdmin ? 1 : 0) +
                (securityContext ? 1 : 0)
            ]
          }`}
        >
          <TabsTrigger value="general" className="cursor-pointer">{t("tabs.general")}</TabsTrigger>
          <TabsTrigger value="appearance" className="cursor-pointer">{t("tabs.appearance")}</TabsTrigger>
          <TabsTrigger value="monetary" className="cursor-pointer">{t("tabs.monetary")}</TabsTrigger>
          <TabsTrigger value="profile" className="cursor-pointer">{t("tabs.profile")}</TabsTrigger>
          <TabsTrigger value="account" className="cursor-pointer">{t("tabs.account")}</TabsTrigger>
          {notificationsContext && (
            <TabsTrigger value="notifications" className="cursor-pointer">{t("tabs.notifications")}</TabsTrigger>
          )}
          {integrationsContext && (
            <TabsTrigger value="integrations" className="cursor-pointer">{t("tabs.integrations")}</TabsTrigger>
          )}
          {isAdmin && <TabsTrigger value="admin" className="cursor-pointer">{t("tabs.admin")}</TabsTrigger>}
          {securityContext && (
            <TabsTrigger value="security" className="cursor-pointer">{t("tabs.security")}</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="general" className="border-none p-0 mt-6 outline-none">
          <div className="max-w-3xl">
            <GeneralForm
              initialQuickPaymentSettings={initialQuickPaymentSettings}
              quickPaymentOptions={quickPaymentOptions}
            />
          </div>
        </TabsContent>
        
        <TabsContent value="appearance" className="border-none p-0 mt-6 outline-none">
          <div className="max-w-5xl">
            <AppearanceForm />
          </div>
        </TabsContent>

        <TabsContent value="monetary" className="border-none p-0 mt-6 outline-none">
          <div className="max-w-3xl">
            <MonetaryFormatForm initialValues={initialMonetarySettings} />
          </div>
        </TabsContent>
        
        <TabsContent value="profile" className="border-none p-0 mt-6 outline-none">
          <div className="max-w-3xl">
            <ProfileForm />
          </div>
        </TabsContent>
        
        <TabsContent value="account" className="border-none p-0 mt-6 outline-none">
          <div className="max-w-3xl">
            <AccountForm />
          </div>
        </TabsContent>

        {notificationsContext && (
          <TabsContent value="notifications" className="border-none p-0 mt-6 outline-none">
            <div className="max-w-3xl space-y-4">
              {demoShowcase && <DemoShowcaseBanner />}
              <NotificationsForm
                initialPreferences={notificationsContext.preferences}
                initialTelegramConnected={notificationsContext.telegramConnected}
                initialLedgerReady={notificationsContext.ledgerReady}
                demoMode={demoShowcase}
              />
            </div>
          </TabsContent>
        )}

        {integrationsContext && (
          <TabsContent value="integrations" className="border-none p-0 mt-6 outline-none">
            <div className="max-w-3xl space-y-4">
              {demoShowcase && <DemoShowcaseBanner />}
              <IntegrationsForm
                initialStructure={integrationsContext.structure}
                initialBot={integrationsContext.bot}
                initialAi={integrationsContext.ai}
                initialTick={integrationsContext.tick}
                initialBackup={integrationsContext.backup}
                readOnly={demoShowcase}
              />
            </div>
          </TabsContent>
        )}

        {securityContext && (
          <TabsContent value="security" className="border-none p-0 mt-6 outline-none">
            <div className="max-w-3xl space-y-4">
              {securityContext.showcase && <DemoShowcaseBanner />}
              <SecurityForm {...securityContext} />
            </div>
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="admin" className="border-none p-0 mt-6 outline-none">
            <div className="max-w-5xl space-y-4">
              {demoShowcase && <DemoShowcaseBanner />}
              <AdminUsersForm
                initialUsers={initialAdminUsers}
                context={adminContext}
                readOnly={demoShowcase}
              />
            </div>
          </TabsContent>
        )}
      </Tabs>
      
    </div>
  )
}
