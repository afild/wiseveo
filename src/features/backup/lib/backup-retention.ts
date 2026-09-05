/** Uma cópia como o Drive a descreve. `createdAt` em ISO 8601. */
export interface BackupFile {
  id: string
  name: string
  sizeBytes: number
  createdAt: string
}

/** Nunca deixar a pasta com menos que isto, mesmo que `keep` peça: uma sequência de falhas não pode esvaziá-la. */
export const RETENTION_FLOOR = 7

/** Devolve o que apagar, das mais velhas para as mais novas. Nunca inclui a mais nova. */
export function pickBackupsToDelete(files: BackupFile[], keep: number): BackupFile[] {
  const floor = Math.max(keep, RETENTION_FLOOR)
  if (files.length <= floor) return []
  const sorted = [...files].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
  return sorted.slice(0, files.length - floor)
}
