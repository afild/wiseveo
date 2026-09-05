import { describe, expect, it } from "vitest"
import { defaultBackupPreferences, resolveBackupPreferences } from "../src/features/backup/lib/backup-preferences"

/** `preferences_json.backup` pode não existir, estar pela metade ou vir estragado. */
describe("resolveBackupPreferences", () => {
  it("nada gravado: desligado, 03:00, guarda 30, Drive não conectado", () => {
    expect(resolveBackupPreferences(undefined)).toEqual(defaultBackupPreferences)
    expect(resolveBackupPreferences(null)).toEqual(defaultBackupPreferences)
    expect(resolveBackupPreferences("lixo")).toEqual(defaultBackupPreferences)
  })

  it("aceita o que é válido e corrige o resto", () => {
    expect(
      resolveBackupPreferences({ enabled: true, hour: 22, minute: 45, keep: 60, driveGrantedAt: "2026-09-05T12:00:00.000Z" }),
    ).toEqual({ enabled: true, hour: 22, minute: 45, keep: 60, driveGrantedAt: "2026-09-05T12:00:00.000Z" })
    expect(resolveBackupPreferences({ hour: 99, minute: 7, keep: 1 })).toEqual({
      ...defaultBackupPreferences,
      hour: 3,
      minute: 0,
      keep: 7,
    })
    expect(resolveBackupPreferences({ keep: 9999 }).keep).toBe(365)
    expect(resolveBackupPreferences({ driveGrantedAt: 123 }).driveGrantedAt).toBeNull()
  })

  it("minuto só nas batidas do despertador (0, 15, 30, 45)", () => {
    expect(resolveBackupPreferences({ minute: 15 }).minute).toBe(15)
    expect(resolveBackupPreferences({ minute: 16 }).minute).toBe(0)
  })
})
