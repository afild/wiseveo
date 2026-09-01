import type { NotificationPreferences } from "@/features/notifications/lib/preferences"
import type { AppSettingsStructure } from "./app-settings-structure"
import type { SharedAccountStructure } from "./shared-account-structure"
import type { AdminUserSummary } from "../services/admin-users-service"
import type { InvitationSummary } from "../services/invitations-service"

/**
 * Dados FICTÍCIOS das abas ilustrativas da demo (Avisos, Integrações, Admin).
 * Vivem só no código: nada disto toca o banco da demo, e o APP nunca importa
 * este módulo fora do modo demonstração. Nomes e dados seguem o padrão inglês
 * do universo WISEVEO; e-mails saem mascarados porque a demo nunca exibe
 * e-mail de verdade. Fuso de referência do software: Orlando/FL.
 */

const DAY_MS = 24 * 60 * 60 * 1000

export function demoNotificationPreferences(): NotificationPreferences {
  return {
    timezone: "America/New_York",
    dailyDigest: { enabled: true, time: "08:00" },
    weeklyDigest: { enabled: false, time: "08:00", weekday: 1 },
    monthlyDigest: { enabled: true, time: "09:00", day: 1 },
    sentinel: { enabled: false, time: "20:00" },
    billsReminder: { enabled: true, time: "08:30", daysAhead: 3 },
  }
}

export function demoAppSettingsStructure(): AppSettingsStructure {
  return {
    ready: true,
    secretsReady: true,
    advisorReady: true,
    notificationsReady: true,
    kpiHistoryReady: true,
    missing: [],
  }
}

export function demoIntegrationsContext() {
  const now = new Date()
  return {
    structure: demoAppSettingsStructure(),
    bot: { configured: true, source: "db" as const, botUsername: "Wiseveo" },
    ai: {
      providers: {
        openai: { configured: true, source: "db" as const },
        anthropic: { configured: true, source: "db" as const },
        google: { configured: false, source: null },
        deepseek: { configured: false, source: null },
        kimi: { configured: false, source: null },
        compatible: { configured: false, source: null },
      },
      compatibleBaseUrl: null,
      models: {
        fast: { provider: "openai" as const, model: "gpt-4o-mini" },
        smart: { provider: "anthropic" as const, model: "claude-sonnet-4-5" },
      },
      budget: { monthlyLimitUsd: 10 },
      usage: { period: now.toISOString().slice(0, 7), calls: 128, costUsd: 2.41 },
    },
    tick: { configured: true, source: "db" as const },
  }
}

const DEMO_SHARED_ACCOUNT: SharedAccountStructure = { ready: true, missing: [] }

export function demoAdminShowcase(viewerId: string): {
  users: AdminUserSummary[]
  context: {
    currentUserId: string
    currentUserRole: "SUPERADMIN"
    sharedAccount: SharedAccountStructure
    invitations: InvitationSummary[]
    ownerId: string
    memberIds: string[]
  }
} {
  const now = Date.now()
  const iso = (daysAgo: number) => new Date(now - daysAgo * DAY_MS).toISOString()
  const users: AdminUserSummary[] = [
    {
      id: viewerId,
      /* i18n-ignore: nome fictício da conta de demonstração, não é texto de UI */
      name: "WISEVEO Demo",
      email: "w•••@w•••.com",
      role: "SUPERADMIN",
      status: "ACTIVE",
      createdAt: iso(240),
      updatedAt: iso(2),
    },
    {
      id: "demo-user-sofia",
      /* i18n-ignore: nome fictício de usuário da demonstração, não é texto de UI */
      name: "Sofia Carter",
      email: "s•••@w•••.com",
      role: "ADMIN",
      status: "ACTIVE",
      createdAt: iso(180),
      updatedAt: iso(6),
    },
    {
      id: "demo-user-james",
      /* i18n-ignore: nome fictício de usuário da demonstração, não é texto de UI */
      name: "James Miller",
      email: "j•••@w•••.com",
      role: "USER",
      status: "ACTIVE",
      createdAt: iso(95),
      updatedAt: iso(10),
    },
    {
      id: "demo-user-emma",
      /* i18n-ignore: nome fictício de usuário da demonstração, não é texto de UI */
      name: "Emma Wright",
      email: "e•••@w•••.com",
      role: "USER",
      status: "PENDING",
      createdAt: iso(1),
      updatedAt: iso(1),
    },
  ]
  const invitations: InvitationSummary[] = [
    {
      id: "demo-invitation-1",
      email: "o•••@w•••.com",
      role: "USER",
      /* i18n-ignore: nome fictício da conta de demonstração, não é texto de UI */
      invitedByName: "WISEVEO Demo",
      createdAt: iso(2),
      expiresAt: new Date(now + 5 * DAY_MS).toISOString(),
    },
  ]
  return {
    users,
    context: {
      currentUserId: viewerId,
      currentUserRole: "SUPERADMIN",
      sharedAccount: DEMO_SHARED_ACCOUNT,
      invitations,
      ownerId: viewerId,
      memberIds: ["demo-user-sofia", "demo-user-james"],
    },
  }
}
