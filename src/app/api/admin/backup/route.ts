import { NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { isSuperAdminSession } from "@/lib/setup-access"
import { getSessionUserId } from "@/lib/session"
import { getValidAccessToken } from "@/lib/google-auth"
import { AppSettingsError } from "@/features/settings/services/app-settings-service"
import { BackupError, type BackupErrorCode } from "@/features/backup/lib/backup-error"
import { MAX_KEEP, MIN_KEEP } from "@/features/backup/lib/backup-preferences"
import { getBackupStatus, updateBackupSettings } from "@/features/backup/services/backup-config.service"
import { createDriveClient } from "@/features/backup/services/google-drive.client"
import { runBackup } from "@/features/backup/services/run-backup.service"

/**
 * O cartão "Backup no Google Drive" fala com esta rota:
 *   GET  → view + lista de cópias na pasta do Drive
 *   PUT  → liga/desliga, horário, quantas guardar
 *   POST → "Fazer backup agora" (roda o ciclo inteiro, até 300 s)
 * Só SUPERADMIN, fora da demo: 404 vazio nos dois casos, como as rotas admin irmãs.
 */
export const dynamic = "force-dynamic"
export const maxDuration = 300

async function guard(): Promise<boolean> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return false
  return isSuperAdminSession()
}

const settingsSchema = z.object({
  enabled: z.boolean(),
  hour: z.number().int().min(0).max(23),
  minute: z.union([z.literal(0), z.literal(15), z.literal(30), z.literal(45)]),
  keep: z.number().int().min(MIN_KEEP).max(MAX_KEEP),
})

export async function GET() {
  if (!(await guard())) return new NextResponse(null, { status: 404 })
  try {
    const status = await getBackupStatus()
    if (!status) return NextResponse.json({ success: true, data: null })
    let files: unknown[] = []
    if (status.driveConnected && status.folderId) {
      const userId = await getSessionUserId()
      const token = userId ? await getValidAccessToken(userId) : null
      if (token) files = await createDriveClient(token).listFiles(status.folderId).catch(() => [])
    }
    return NextResponse.json({ success: true, data: { ...status, files } })
  } catch (error) {
    return failure(error)
  }
}

export async function PUT(request: Request) {
  if (!(await guard())) return new NextResponse(null, { status: 404 })
  try {
    const parsed = settingsSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new BackupError("invalidPayload")
    const userId = await getSessionUserId()
    if (!userId) return new NextResponse(null, { status: 404 })
    const data = await updateBackupSettings(userId, parsed.data)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    return failure(error)
  }
}

export async function POST() {
  if (!(await guard())) return new NextResponse(null, { status: 404 })
  try {
    const result = await runBackup({ trigger: "manual" })
    if (result.outcome === "failed") throw new BackupError(result.code as BackupError["code"], result.message)
    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    return failure(error)
  }
}

/** Os códigos que viram texto de tela em `api.backup.*`. `alreadyRunning` não tem chave: cai no genérico. */
const TRANSLATED_CODES = [
  "driveFailed",
  "driveNotConnected",
  "dumpFailed",
  "dumpRejected",
  "invalidPayload",
  "notPrepared",
  "sandboxFailed",
] as const

type TranslatedCode = (typeof TRANSLATED_CODES)[number]

function isTranslatedCode(code: BackupErrorCode): code is TranslatedCode {
  return (TRANSLATED_CODES as readonly string[]).includes(code)
}

async function failure(error: unknown) {
  if (error instanceof AppSettingsError && error.code === "tableMissing") {
    const t = await getTranslations("api.backup")
    return NextResponse.json({ success: false, code: "notPrepared", message: t("notPrepared") }, { status: 400 })
  }
  if (error instanceof BackupError && isTranslatedCode(error.code)) {
    const t = await getTranslations("api.backup")
    const status = error.code === "invalidPayload" ? 400 : 502
    return NextResponse.json({ success: false, code: error.code, message: t(error.code) }, { status })
  }
  console.error("[BACKUP] admin route failed:", error) // i18n-ignore: prefixo de log de servidor, nunca exibido em tela
  const t = await getTranslations("api.errors")
  return NextResponse.json({ success: false, message: t("internalError") }, { status: 500 })
}
