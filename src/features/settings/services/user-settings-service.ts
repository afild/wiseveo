import { getTranslations } from "next-intl/server"
import { Prisma } from "@/generated/prisma_new/client"
import { isAppLocale, type AppLocale } from "@/i18n/config"
import { resolveLocaleOrInstallDefault } from "@/i18n/install-locale"
import { prisma } from "@/lib/prisma"
import { resolveDataOwnerId } from "@/lib/data-owner"
import {
  resolveMonetarySettings,
  type MonetarySettings,
} from "@/lib/monetary"
import {
  normalizeThemePreferences,
  type ThemePreferences,
} from "@/lib/theme-preferences"
import {
  resolveNotificationPreferences,
  type NotificationPreferences,
} from "@/features/notifications/lib/preferences"
import bcrypt from "bcryptjs"

export type AppearanceSettings = ThemePreferences

export interface ProfileSettings {
  firstName: string
  lastName: string
  email: string
  phone?: string
  company?: string
  location?: string
  website?: string
  language?: string
  role?: string
  timezone?: string
  bio?: string
}

export interface AccountSettings {
  firstName: string
  lastName: string
  email: string
  username: string
  currentPassword?: string
  newPassword?: string
}

export { type MonetarySettings }

export interface QuickPaymentSettings {
  defaultAccountId: number | null
  defaultStatusCode: number | null
}

export interface QuickPaymentOptions {
  accounts: Array<{
    id: number
    name: string
  }>
  statuses: Array<{
    code: number
    name: string
  }>
}

export const defaultQuickPaymentSettings: QuickPaymentSettings = {
  defaultAccountId: null,
  defaultStatusCode: null,
}

type JsonRecord = Record<string, unknown>

function ensureJsonRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {}
}

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

function toOptionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    if (Number.isInteger(parsed)) {
      return parsed
    }
  }

  return null
}

export function resolveQuickPaymentSettings(value: unknown): QuickPaymentSettings {
  const record = ensureJsonRecord(value)

  return {
    defaultAccountId: toOptionalNumber(record.defaultAccountId),
    defaultStatusCode: toOptionalNumber(record.defaultStatusCode),
  }
}

export async function updateUserAppearance(userId: string, settings: AppearanceSettings) {
  const nextAppearance = normalizeThemePreferences(settings)
  const currentPreferences = await getUserPreferences(userId)

  return prisma.user.update({
    where: { id: userId },
    data: {
      themePreferences: toInputJsonValue(nextAppearance),
      preferencesJson: toInputJsonValue({
        ...currentPreferences,
        appearance: nextAppearance,
      }),
    },
  })
}

export async function getUserAppearanceSettings(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { themePreferences: true, preferencesJson: true },
  })

  const preferencesJson = (user?.preferencesJson as Record<string, unknown> | null) ?? {}
  const appearance =
    (preferencesJson as Record<string, unknown>).appearance ?? user?.themePreferences ?? null

  return normalizeThemePreferences(appearance)
}

export async function updateUserProfile(userId: string, data: ProfileSettings) {
  const name = `${data.firstName} ${data.lastName}`.trim()
  const currentPreferences = await getUserPreferences(userId)
  
  return prisma.user.update({
    where: { id: userId },
    data: {
      name,
      email: data.email,
      phone: data.phone,
      preferencesJson: toInputJsonValue({
        ...currentPreferences,
        profile: {
          company: data.company,
          location: data.location,
          website: data.website,
          language: data.language,
          role: data.role,
          timezone: data.timezone,
          bio: data.bio,
        },
      }),
    },
  })
}

export async function updateUserAccount(userId: string, data: AccountSettings) {
  const updateData: Prisma.UserUpdateInput = {
    name: `${data.firstName} ${data.lastName}`.trim(),
    email: data.email,
  }

  // Lógica de troca de senha se fornecida
  if (data.currentPassword && data.newPassword) {
    const t = await getTranslations("settings.account.errors")
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    })

    if (!user || !user.passwordHash) {
      throw new Error(t("noLocalPassword"))
    }

    const isMatch = await bcrypt.compare(data.currentPassword, user.passwordHash)
    if (!isMatch) {
      throw new Error(t("currentPasswordIncorrect"))
    }

    updateData.passwordHash = await bcrypt.hash(data.newPassword, 10)
  }

  return prisma.user.update({
    where: { id: userId },
    data: updateData,
  })
}

export async function getUserMonetarySettings(userId: string) {
  const prefs = await getUserPreferences(userId)
  return resolveMonetarySettings(ensureJsonRecord(prefs.monetary))
}

export async function getUserQuickPaymentSettings(userId: string) {
  const prefs = await getUserPreferences(userId)
  return resolveQuickPaymentSettings(prefs.quickPayment)
}

/**
 * Locale de UI persistido do usuário (User.preferencesJson.locale).
 * Fonte de verdade para canais sem cookie (Telegram, jobs); cai no idioma
 * da instalação (env WISEVEO_DEFAULT_LOCALE → en-US) quando ausente ou inválido.
 */
export async function getUserLocale(userId: string): Promise<AppLocale> {
  const prefs = await getUserPreferences(userId)
  return resolveLocaleOrInstallDefault(prefs.locale)
}

/**
 * Persiste o locale de UI do usuário em User.preferencesJson.locale.
 * Valores fora de LOCALES são ignorados silenciosamente (no-op).
 */
export async function setUserLocale(userId: string, locale: string): Promise<void> {
  if (!isAppLocale(locale)) return

  const currentPreferences = await getUserPreferences(userId)

  await prisma.user.update({
    where: { id: userId },
    data: {
      preferencesJson: toInputJsonValue({
        ...currentPreferences,
        locale,
      }),
    },
  })
}

/**
 * Avisos automáticos (boletins, sentinela, lembrete de contas) da PESSOA — não
 * da instalação. Vive em `preferencesJson.notifications`, como todo o resto:
 * nenhuma coluna nova em `users`.
 */
export async function getUserNotificationSettings(
  userId: string,
): Promise<NotificationPreferences> {
  const prefs = await getUserPreferences(userId)
  return resolveNotificationPreferences(prefs.notifications)
}

export async function updateUserNotificationSettings(
  userId: string,
  settings: unknown,
): Promise<NotificationPreferences> {
  const next = resolveNotificationPreferences(settings)
  const currentPreferences = await getUserPreferences(userId)

  await prisma.user.update({
    where: { id: userId },
    data: {
      preferencesJson: toInputJsonValue({
        ...currentPreferences,
        notifications: next,
      }),
    },
  })

  return next
}

export async function getQuickPaymentOptions(
  userId: string,
): Promise<QuickPaymentOptions> {
  // Conta compartilhada: a preferência é da pessoa, mas contas e status são do dono.
  const dataOwnerId = await resolveDataOwnerId(userId)
  const [accounts, statuses] = await Promise.all([
    prisma.account.findMany({
      where: { userId: dataOwnerId, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.transactionStatusLookup.findMany({
      where: { userId: dataOwnerId },
      select: { code: true, name: true },
      orderBy: { name: "asc" },
    }),
  ])

  return { accounts, statuses }
}

export async function updateUserMonetarySettings(
  userId: string,
  settings: Partial<MonetarySettings>,
) {
  const currentPreferences = await getUserPreferences(userId)
  const nextMonetary = resolveMonetarySettings({
    ...ensureJsonRecord(currentPreferences.monetary),
    ...settings,
  })

  await prisma.user.update({
    where: { id: userId },
    data: {
      preferencesJson: toInputJsonValue({
        ...currentPreferences,
        monetary: nextMonetary,
      }),
    },
  })

  return nextMonetary
}

export async function updateUserQuickPaymentSettings(
  userId: string,
  settings: QuickPaymentSettings,
) {
  const nextQuickPayment = resolveQuickPaymentSettings(settings)
  const t = await getTranslations("settings.general.errors")

  if (
    nextQuickPayment.defaultAccountId === null ||
    nextQuickPayment.defaultStatusCode === null
  ) {
    throw new Error(t("quickPaymentSelectionRequired"))
  }

  const dataOwnerId = await resolveDataOwnerId(userId)
  const [account, status, currentPreferences] = await Promise.all([
    prisma.account.findFirst({
      where: {
        id: nextQuickPayment.defaultAccountId,
        userId: dataOwnerId,
        active: true,
      },
      select: { id: true },
    }),
    prisma.transactionStatusLookup.findFirst({
      where: {
        code: nextQuickPayment.defaultStatusCode,
        userId: dataOwnerId,
      },
      select: { code: true },
    }),
    getUserPreferences(userId),
  ])

  if (!account) {
    throw new Error(t("quickPaymentAccountUnavailable"))
  }

  if (!status) {
    throw new Error(t("quickPaymentStatusUnavailable"))
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      preferencesJson: toInputJsonValue({
        ...currentPreferences,
        quickPayment: nextQuickPayment,
      }),
    },
  })

  return nextQuickPayment
}

async function getUserPreferences(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferencesJson: true },
  })
  return ensureJsonRecord(user?.preferencesJson)
}

export async function getUserSettings(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  })
  
  if (!user) return null

  const prefs = ensureJsonRecord(user.preferencesJson)
  const profile = ensureJsonRecord(prefs.profile)
  const monetary = ensureJsonRecord(prefs.monetary)
  const quickPayment = resolveQuickPaymentSettings(prefs.quickPayment)
  const appearance = normalizeThemePreferences(
    prefs.appearance ?? user.themePreferences ?? null,
  )

  const [firstName, ...lastNameParts] = user.name.split(" ")
  const lastName = lastNameParts.join(" ")

  return {
    appearance: {
      ...appearance,
    },
    profile: {
      firstName: firstName || "",
      lastName: lastName || "",
      email: user.email,
      phone: user.phone || "",
      company: profile.company || "",
      location: profile.location || "",
      website: profile.website || "",
      language: profile.language || "",
      role: profile.role || "",
      timezone: profile.timezone || "",
      bio: profile.bio || "",
    },
    account: {
      firstName: firstName || "",
      lastName: lastName || "",
      email: user.email,
      username: user.email.split("@")[0], // Fallback username
    },
    monetary: resolveMonetarySettings(monetary),
    general: {
      quickPayment,
    },
  }
}
