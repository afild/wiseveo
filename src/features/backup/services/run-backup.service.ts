import { getTranslations } from "next-intl/server"
import { getValidAccessToken } from "@/lib/google-auth"
import { claimDelivery, markDelivered, markFailed } from "@/features/notifications/services/delivery-ledger.service"
import { sendTextNotification } from "@/features/notifications/services/notification-channel.service"
import { BackupError } from "@/features/backup/lib/backup-error"
import { pickBackupsToDelete } from "@/features/backup/lib/backup-retention"
import { decideBackup, type BackupTrigger } from "@/features/backup/lib/backup-schedule"
import { checkDumpToc } from "@/features/backup/lib/dump-check"
import { resolveDumpUrl } from "@/features/backup/lib/dump-url"
import {
  BACKUP_FOLDER_NAME,
  findBackupOwner,
  readFolderId,
  recordLastRun,
  saveFolderId,
  type BackupOwner,
} from "@/features/backup/services/backup-config.service"
import { createDriveClient } from "@/features/backup/services/google-drive.client"
import { runPgDumpInSandbox } from "@/features/backup/services/sandbox-dump.service"
import { getZonedParts } from "@/features/notifications/lib/schedule"

/**
 * O ciclo inteiro de um backup (desenho §6). Mesma coreografia do tique dos avisos:
 * decidir → reservar em notification_deliveries → fazer → marcar → avisar.
 *
 * Reserva ANTES de fazer, para duas batidas do despertador no mesmo minuto não gerarem
 * dois dumps. Falha depois da reserva fica como `failed` (não libera): no máximo uma
 * tentativa por dia, e o aviso no Telegram é quem chama atenção.
 */
export const BACKUP_KIND = "backup"

export type BackupRunResult =
  | { outcome: "sent"; occurrenceKey: string; fileName: string; sizeBytes: number; objects: number; durationMs: number }
  | { outcome: "skipped"; reason: "noOwner" | "disabled" | "driveNotConnected" | "notYet" | "alreadyClaimed" }
  | { outcome: "failed"; occurrenceKey: string; code: string; message: string }

export interface RunBackupInput {
  trigger: BackupTrigger
  now?: Date
}

const pad = (n: number) => String(n).padStart(2, "0")

function fileNameFor(now: Date, timezone: string): string {
  const p = getZonedParts(now, timezone)
  return `wiseveo-app-${p.year}${pad(p.month)}${pad(p.day)}-${pad(p.hour)}${pad(p.minute)}.dump`
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`
}

async function notify(owner: BackupOwner, key: "ok" | "failed", values: Record<string, string | number>): Promise<void> {
  if (!owner.chatId) return
  try {
    const t = await getTranslations({ locale: owner.locale, namespace: "notifications" })
    await sendTextNotification(owner.chatId, t(`backup.${key}`, values))
  } catch (error) {
    // O aviso é cortesia; nunca muda o resultado do backup.
    console.error("[BACKUP] telegram notice failed:", error instanceof Error ? error.message : error) // i18n-ignore: prefixo de log de servidor, nunca exibido em tela
  }
}

export async function runBackup(input: RunBackupInput): Promise<BackupRunResult> {
  const now = input.now ?? new Date()
  const owner = await findBackupOwner()
  if (!owner) return { outcome: "skipped", reason: "noOwner" }

  const decision = decideBackup({ now, timezone: owner.timezone, preferences: owner.preferences, trigger: input.trigger })
  if (!decision.run) return { outcome: "skipped", reason: decision.reason }

  const ref = { userId: owner.userId, kind: BACKUP_KIND, occurrenceKey: decision.occurrenceKey }
  if (!(await claimDelivery(ref, now))) return { outcome: "skipped", reason: "alreadyClaimed" }

  const fileName = fileNameFor(now, owner.timezone)
  try {
    const token = await getValidAccessToken(owner.userId)
    if (!token) throw new BackupError("driveNotConnected")

    const produced = await runPgDumpInSandbox({ databaseUrl: resolveDumpUrl(process.env) })
    const check = checkDumpToc(produced.toc, produced.dump.length)
    if (!check.ok) throw new BackupError("dumpRejected", check.reason)

    const drive = createDriveClient(token)
    let folderId = await readFolderId()
    if (!folderId) {
      folderId = await drive.ensureFolder(BACKUP_FOLDER_NAME)
      await saveFolderId(folderId)
    }
    const uploaded = await drive.uploadFile({
      folderId,
      name: fileName,
      description: `${check.objects} objects; ${produced.pgDumpVersion}; ${formatSize(produced.dump.length)}`, // i18n-ignore: descrição técnica do arquivo no Drive, dado e não texto de tela
      content: produced.dump,
    })

    const existing = await drive.listFiles(folderId)
    for (const old of pickBackupsToDelete(existing, owner.preferences.keep)) {
      if (old.id === uploaded.id) continue
      await drive
        .deleteFile(old.id)
        .catch((error) => console.error("[BACKUP] retention delete failed:", error instanceof Error ? error.message : error)) // i18n-ignore: prefixo de log de servidor, nunca exibido em tela
    }

    const summary = { fileName, sizeBytes: uploaded.sizeBytes, objects: check.objects, durationMs: produced.durationMs }
    await markDelivered(ref, JSON.stringify(summary).slice(0, 500))
    await recordLastRun({ at: now.toISOString(), ok: true, fileName, sizeBytes: uploaded.sizeBytes, message: null })
    await notify(owner, "ok", { file: fileName, size: formatSize(uploaded.sizeBytes), objects: check.objects })
    return { outcome: "sent", occurrenceKey: decision.occurrenceKey, ...summary }
  } catch (error) {
    const code = error instanceof BackupError ? error.code : "internalError"
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[BACKUP] ${decision.occurrenceKey} failed:`, message) // i18n-ignore: prefixo de log de servidor, nunca exibido em tela
    await markFailed(ref, `${code}: ${message}`.slice(0, 500))
    await recordLastRun({ at: now.toISOString(), ok: false, fileName: null, sizeBytes: null, message: code })
    await notify(owner, "failed", { reason: code })
    return { outcome: "failed", occurrenceKey: decision.occurrenceKey, code, message }
  }
}
