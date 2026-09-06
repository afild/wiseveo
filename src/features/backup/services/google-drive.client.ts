import crypto from "node:crypto"
import type { BackupFile } from "@/features/backup/lib/backup-retention"
import { BackupError } from "@/features/backup/lib/backup-error"

/**
 * Cliente mínimo do Google Drive v3 com `fetch` puro, no estilo de `src/lib/google-auth.ts`.
 * Escopo drive.file: o app só enxerga o que ele mesmo criou, inclusive a pasta.
 * O token de acesso vem de `getValidAccessToken(userId)` e NUNCA entra em mensagem de erro.
 */
const API = "https://www.googleapis.com/drive/v3"
const UPLOAD = "https://www.googleapis.com/upload/drive/v3"
const FOLDER_MIME = "application/vnd.google-apps.folder"
const FILE_FIELDS = "id,name,size,createdTime"

interface DriveFileRaw {
  id: string
  name: string
  size?: string
  createdTime: string
}

function toBackupFile(raw: DriveFileRaw): BackupFile {
  return { id: raw.id, name: raw.name, sizeBytes: Number(raw.size ?? 0), createdAt: raw.createdTime }
}

export interface DriveClient {
  ensureFolder(name: string): Promise<string>
  uploadFile(input: { folderId: string; name: string; description: string; content: Buffer }): Promise<BackupFile>
  listFiles(folderId: string): Promise<BackupFile[]>
  deleteFile(id: string): Promise<void>
}

export function createDriveClient(accessToken: string, fetchImpl: typeof fetch = fetch): DriveClient {
  const auth = { Authorization: `Bearer ${accessToken}` }

  async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
    const res = await fetchImpl(url, { ...init, headers: { ...auth, ...(init.headers as Record<string, string> | undefined) } })
    if (!res.ok) {
      // Só o status e o começo do corpo: o token está no cabeçalho, nunca aqui.
      const body = await res.text().catch(() => "")
      throw new BackupError("driveFailed", `HTTP ${res.status} ${body.slice(0, 200)}`)
    }
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }

  return {
    async ensureFolder(name) {
      const q = `name='${name.replace(/'/g, "\\'")}' and mimeType='${FOLDER_MIME}' and trashed = false`
      const found = await call<{ files: DriveFileRaw[] }>(`${API}/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`)
      if (found.files?.[0]?.id) return found.files[0].id
      const created = await call<{ id: string }>(`${API}/files?fields=id`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, mimeType: FOLDER_MIME }),
      })
      return created.id
    },

    async uploadFile({ folderId, name, description, content }) {
      const boundary = `wiseveo-${crypto.randomBytes(12).toString("hex")}`
      const meta = JSON.stringify({ name, description, parents: [folderId] })
      const head = Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
        "utf8",
      )
      const tail = Buffer.from(`\r\n--${boundary}--`, "utf8")
      const body = Buffer.concat([head, content, tail])
      const raw = await call<DriveFileRaw>(`${UPLOAD}/files?uploadType=multipart&fields=${FILE_FIELDS}`, {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}`, "Content-Length": String(body.length) },
        body,
      })
      return toBackupFile(raw)
    },

    async listFiles(folderId) {
      const q = `'${folderId}' in parents and trashed = false`
      const out = await call<{ files: DriveFileRaw[] }>(
        `${API}/files?q=${encodeURIComponent(q)}&fields=files(${FILE_FIELDS})&orderBy=createdTime desc&pageSize=200`,
      )
      return (out.files ?? []).map(toBackupFile)
    },

    async deleteFile(id) {
      await call<void>(`${API}/files/${encodeURIComponent(id)}`, { method: "DELETE" })
    },
  }
}
