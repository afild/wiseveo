/**
 * `users.preferences_json.backup` do SUPERADMIN. Nenhuma coluna nova (regra de ouro dos
 * bancos): tudo que o cartão e o consentimento do Drive gravam mora aqui.
 *
 * `driveGrantedAt` é a prova de que o escopo do Drive foi concedido (o callback grava
 * quando a resposta do Google traz drive.file). Sem ele, o backup não roda.
 */
export interface BackupPreferences {
  enabled: boolean
  /** Hora local do dono (fuso das notificações), 0 a 23. */
  hour: number
  /** Só as batidas do despertador: 0, 15, 30 ou 45. */
  minute: 0 | 15 | 30 | 45
  /** Quantas cópias ficam no Drive, 7 a 365. */
  keep: number
  /** ISO 8601 de quando o Drive foi autorizado; null = não conectado. */
  driveGrantedAt: string | null
}

export const MIN_KEEP = 7
export const MAX_KEEP = 365
export const BACKUP_MINUTES = [0, 15, 30, 45] as const

export const defaultBackupPreferences: BackupPreferences = {
  enabled: false,
  hour: 3,
  minute: 0,
  keep: 30,
  driveGrantedAt: null,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function intBetween(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isInteger(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

export function resolveBackupPreferences(value: unknown): BackupPreferences {
  if (!isRecord(value)) return { ...defaultBackupPreferences }
  const hour = typeof value.hour === "number" && Number.isInteger(value.hour) && value.hour >= 0 && value.hour <= 23
    ? value.hour
    : defaultBackupPreferences.hour
  const minute = (BACKUP_MINUTES as readonly number[]).includes(value.minute as number)
    ? (value.minute as BackupPreferences["minute"])
    : defaultBackupPreferences.minute
  return {
    enabled: value.enabled === true,
    hour,
    minute,
    keep: intBetween(value.keep, MIN_KEEP, MAX_KEEP, defaultBackupPreferences.keep),
    driveGrantedAt: typeof value.driveGrantedAt === "string" && value.driveGrantedAt !== "" ? value.driveGrantedAt : null,
  }
}
