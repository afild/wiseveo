import { prisma } from "@/lib/prisma"
import { readAppSecrets, writeAppSecrets } from "@/features/settings/services/app-settings-service"
import { mergeUserPreferenceKey } from "@/features/settings/services/user-preferences-write"
import { resolveNotificationPreferences } from "@/features/notifications/lib/preferences"
import { resolveLocaleOrInstallDefault } from "@/i18n/install-locale"
import type { AppLocale } from "@/i18n/config"
import { resolveBackupPreferences, type BackupPreferences } from "@/features/backup/lib/backup-preferences"

/**
 * Onde a configuração do backup mora, sem coluna nova:
 *  - `users.preferences_json.backup` do SUPERADMIN: enabled, hour, minute, keep,
 *    driveGrantedAt (o consentimento grava este último; a tela grava os outros; os dois
 *    usam MESCLAGEM para nenhum apagar o outro);
 *  - `app_settings`: `backup.driveFolderId` e `backup.lastRun`, cifrados como `ai.models`
 *    (não são segredos, mas é o único escritor que o serviço oferece, e assim seguem a
 *    mesma tolerância a tabela ausente).
 */
export const BACKUP_FOLDER_KEY = "backup.driveFolderId"
export const BACKUP_LAST_RUN_KEY = "backup.lastRun"
export const BACKUP_FOLDER_NAME = "WISEVEO Backups" // i18n-ignore: nome fixo da pasta no Drive, igual nos três idiomas (é dado, não copy de tela)

export interface BackupOwner {
  userId: string
  preferences: BackupPreferences
  timezone: string
  locale: AppLocale
  /** Chat do Telegram do dono, já em texto; null = sem Telegram. */
  chatId: string | null
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

/** O SUPERADMIN ativo mais antigo. É o dono da instalação e de quem o Drive é usado. */
export async function findBackupOwner(): Promise<BackupOwner | null> {
  const user = await prisma.user.findFirst({
    where: { role: "SUPERADMIN", status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { id: true, preferencesJson: true },
  })
  if (!user) return null
  const prefs = asRecord(user.preferencesJson)
  const connection = await prisma.telegramConnection
    .findUnique({ where: { userId: user.id }, select: { telegramChatId: true, isActive: true } })
    .catch(() => null)
  return {
    userId: user.id,
    preferences: resolveBackupPreferences(prefs.backup),
    timezone: resolveNotificationPreferences(prefs.notifications).timezone,
    locale: resolveLocaleOrInstallDefault(prefs.locale),
    chatId: connection && connection.isActive !== false ? connection.telegramChatId.toString() : null,
  }
}

export interface BackupSettingsInput {
  enabled: boolean
  hour: number
  minute: 0 | 15 | 30 | 45
  keep: number
}

/** Só os campos da tela. `driveGrantedAt` é do consentimento e não passa por aqui. */
export async function updateBackupSettings(userId: string, input: BackupSettingsInput): Promise<BackupPreferences> {
  const normalized = resolveBackupPreferences({ ...input, driveGrantedAt: null })
  const patch = { enabled: normalized.enabled, hour: normalized.hour, minute: normalized.minute, keep: normalized.keep }
  await mergeUserPreferenceKey(prisma, userId, "backup", patch)
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { preferencesJson: true } })
  return resolveBackupPreferences(asRecord(user?.preferencesJson).backup)
}

export interface BackupLastRun {
  at: string
  ok: boolean
  fileName: string | null
  sizeBytes: number | null
  message: string | null
}

export async function recordLastRun(run: BackupLastRun): Promise<void> {
  await writeAppSecrets({ [BACKUP_LAST_RUN_KEY]: JSON.stringify(run) })
}

export async function readLastRun(): Promise<BackupLastRun | null> {
  const raw = (await readAppSecrets([BACKUP_LAST_RUN_KEY])).get(BACKUP_LAST_RUN_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as BackupLastRun
  } catch {
    return null
  }
}

export async function readFolderId(): Promise<string | null> {
  return (await readAppSecrets([BACKUP_FOLDER_KEY])).get(BACKUP_FOLDER_KEY) ?? null
}

export async function saveFolderId(id: string): Promise<void> {
  await writeAppSecrets({ [BACKUP_FOLDER_KEY]: id })
}

/** O que a página de Configurações passa ao cartão. Não chama o Drive (a lista vem por GET depois). */
export interface BackupSettingsView {
  driveConnected: boolean
  enabled: boolean
  hour: number
  minute: 0 | 15 | 30 | 45
  keep: number
  timezone: string
  lastRun: BackupLastRun | null
  folderId: string | null
}

export async function getBackupStatus(): Promise<BackupSettingsView | null> {
  const owner = await findBackupOwner()
  if (!owner) return null
  const [lastRun, folderId] = await Promise.all([readLastRun(), readFolderId()])
  return {
    driveConnected: owner.preferences.driveGrantedAt !== null,
    enabled: owner.preferences.enabled,
    hour: owner.preferences.hour,
    minute: owner.preferences.minute,
    keep: owner.preferences.keep,
    timezone: owner.timezone,
    lastRun,
    folderId,
  }
}
