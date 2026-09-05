import { describe, expect, it } from "vitest"
import { pickBackupsToDelete } from "../src/features/backup/lib/backup-retention"

const f = (id: string, createdAt: string) => ({ id, name: `wiseveo-app-${id}.dump`, sizeBytes: 1000, createdAt })
const many = Array.from({ length: 40 }, (_, i) => f(String(i).padStart(2, "0"), `2026-08-${String((i % 28) + 1).padStart(2, "0")}T0${i % 10}:00:00Z`))

describe("pickBackupsToDelete", () => {
  it("guarda as `keep` mais novas e devolve as outras, mais velhas primeiro", () => {
    const toDelete = pickBackupsToDelete(many, 30)
    expect(toDelete).toHaveLength(10)
    const kept = many.filter((x) => !toDelete.some((d) => d.id === x.id))
    const newestDeleted = Math.max(...toDelete.map((d) => Date.parse(d.createdAt)))
    const oldestKept = Math.min(...kept.map((k) => Date.parse(k.createdAt)))
    expect(newestDeleted).toBeLessThanOrEqual(oldestKept)
  })

  it("nunca apaga o mais novo nem deixa a pasta com menos de 7 arquivos", () => {
    const eight = many.slice(0, 8)
    expect(pickBackupsToDelete(eight, 1)).toHaveLength(1)
    expect(pickBackupsToDelete(many.slice(0, 7), 1)).toEqual([])
    expect(pickBackupsToDelete(many.slice(0, 3), 1)).toEqual([])
  })

  it("com menos arquivos que `keep`, não apaga nada", () => {
    expect(pickBackupsToDelete(many.slice(0, 5), 30)).toEqual([])
  })
})
