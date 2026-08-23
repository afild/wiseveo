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
import { GeneralForm } from "./general-form"
import { AppearanceForm } from "./appearance-form"
import { MonetaryFormatForm } from "./monetary-format-form"
import { ProfileForm } from "./profile-form"
import { AccountForm } from "./account-form"
import { AdminUsersForm } from "./admin-users-form"
import { PartyPopper } from "lucide-react"
import { useTranslations } from "next-intl"

interface ConfiguracoesPageClientProps {
  initialTab?: "general" | "appearance" | "monetary" | "profile" | "account" | "admin"
  isAdmin: boolean
  initialQuickPaymentSettings: QuickPaymentSettings
  quickPaymentOptions: QuickPaymentOptions
  initialMonetarySettings: MonetarySettings
  initialAdminUsers: AdminUserSummary[]
  /** Contexto da aba Usuários (só quando isAdmin). */
  adminContext?: {
    currentUserId: string
    currentUserRole: "USER" | "ADMIN" | "SUPERADMIN"
  }
}

export function ConfiguracoesPageClient({
  initialTab = "general",
  isAdmin,
  initialQuickPaymentSettings,
  quickPaymentOptions,
  initialMonetarySettings,
  initialAdminUsers,
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
        <TabsList className={`grid w-full grid-cols-2 gap-2 sm:grid-cols-3 ${isAdmin ? "lg:w-[840px] lg:grid-cols-6" : "lg:w-[720px] lg:grid-cols-5"}`}>
          <TabsTrigger value="general" className="cursor-pointer">{t("tabs.general")}</TabsTrigger>
          <TabsTrigger value="appearance" className="cursor-pointer">{t("tabs.appearance")}</TabsTrigger>
          <TabsTrigger value="monetary" className="cursor-pointer">{t("tabs.monetary")}</TabsTrigger>
          <TabsTrigger value="profile" className="cursor-pointer">{t("tabs.profile")}</TabsTrigger>
          <TabsTrigger value="account" className="cursor-pointer">{t("tabs.account")}</TabsTrigger>
          {isAdmin && <TabsTrigger value="admin" className="cursor-pointer">{t("tabs.admin")}</TabsTrigger>}
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

        {isAdmin && (
          <TabsContent value="admin" className="border-none p-0 mt-6 outline-none">
            <div className="max-w-5xl">
              <AdminUsersForm initialUsers={initialAdminUsers} context={adminContext} />
            </div>
          </TabsContent>
        )}
      </Tabs>
      
    </div>
  )
}
