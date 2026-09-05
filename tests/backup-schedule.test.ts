import { describe, expect, it } from "vitest"
import { decideBackup } from "../src/features/backup/lib/backup-schedule"
import { type BackupPreferences, defaultBackupPreferences } from "../src/features/backup/lib/backup-preferences"

/**
 * O despertador bate a cada 15 min, o dia inteiro. Esta função é quem diz "agora sim".
 * Tudo em função de `now` e do fuso do dono, sem relógio escondido: a TZ do vitest é
 * America/New_York, então os casos usam instantes UTC explícitos.
 */
// A anotação não é enfeite: sem ela o `minute` do literal vira `number` e não cabe no
// tipo do módulo, que só aceita as batidas do despertador (0, 15, 30, 45).
const ready: BackupPreferences = { ...defaultBackupPreferences, enabled: true, hour: 3, minute: 0, driveGrantedAt: "2026-09-01T00:00:00.000Z" }
const NY = "America/New_York"

describe("decideBackup pelo despertador", () => {
  it("desligado não roda", () => {
    expect(decideBackup({ now: new Date("2026-09-05T07:00:00Z"), timezone: NY, preferences: { ...ready, enabled: false }, trigger: "tick" }))
      .toEqual({ run: false, reason: "disabled" })
  })

  it("sem Drive conectado não roda, mesmo ligado", () => {
    expect(decideBackup({ now: new Date("2026-09-05T07:00:00Z"), timezone: NY, preferences: { ...ready, driveGrantedAt: null }, trigger: "tick" }))
      .toEqual({ run: false, reason: "driveNotConnected" })
  })

  it("antes do horário não roda; do horário em diante roda com a chave do dia LOCAL", () => {
    // 03:00 em Nova York (EDT, UTC-4) = 07:00Z
    expect(decideBackup({ now: new Date("2026-09-05T06:45:00Z"), timezone: NY, preferences: ready, trigger: "tick" }))
      .toEqual({ run: false, reason: "notYet" })
    expect(decideBackup({ now: new Date("2026-09-05T07:00:00Z"), timezone: NY, preferences: ready, trigger: "tick" }))
      .toEqual({ run: true, occurrenceKey: "2026-09-05" })
    expect(decideBackup({ now: new Date("2026-09-05T23:30:00Z"), timezone: NY, preferences: ready, trigger: "tick" }))
      .toEqual({ run: true, occurrenceKey: "2026-09-05" })
  })

  it("a chave do dia segue o fuso do dono, não o UTC", () => {
    // 23:30 em Nova York do dia 5 = 03:30Z do dia 6
    const late: BackupPreferences = { ...ready, hour: 23, minute: 30 }
    expect(decideBackup({ now: new Date("2026-09-06T03:30:00Z"), timezone: NY, preferences: late, trigger: "tick" }))
      .toEqual({ run: true, occurrenceKey: "2026-09-05" })
  })
})

describe("decideBackup à mão", () => {
  it("'fazer agora' roda a qualquer hora, com chave própria (não gasta a do dia)", () => {
    const d = decideBackup({ now: new Date("2026-09-05T01:07:00Z"), timezone: NY, preferences: { ...ready, enabled: false }, trigger: "manual" })
    expect(d).toEqual({ run: true, occurrenceKey: "2026-09-04-manual-2107" })
  })

  it("mas ainda exige o Drive conectado", () => {
    expect(decideBackup({ now: new Date("2026-09-05T01:07:00Z"), timezone: NY, preferences: { ...ready, driveGrantedAt: null }, trigger: "manual" }))
      .toEqual({ run: false, reason: "driveNotConnected" })
  })
})
