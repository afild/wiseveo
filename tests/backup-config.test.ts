import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  users: [] as Array<{ id: string; role: string; status: string; preferencesJson: unknown; createdAt: Date }>,
  connection: null as null | { telegramChatId: bigint },
  secrets: new Map<string, string>(),
  merged: [] as Array<{ userId: string; key: string; patch: Record<string, unknown> }>,
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: async (args: { where: { role: string; status: string } }) =>
        m.users.filter((u) => u.role === args.where.role && u.status === args.where.status).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0] ?? null,
      findUnique: async (args: { where: { id: string } }) => m.users.find((u) => u.id === args.where.id) ?? null,
    },
    telegramConnection: { findUnique: async () => m.connection },
  },
}))
vi.mock("@/features/settings/services/app-settings-service", () => ({
  readAppSecrets: async (keys: string[]) => new Map([...m.secrets].filter(([k]) => keys.includes(k))),
  writeAppSecrets: async (entries: Record<string, string>) => {
    for (const [k, v] of Object.entries(entries)) m.secrets.set(k, v)
  },
}))
vi.mock("@/features/settings/services/user-preferences-write", () => ({
  mergeUserPreferenceKey: async (_executor: unknown, userId: string, key: string, patch: Record<string, unknown>) => {
    m.merged.push({ userId, key, patch })
    const user = m.users.find((u) => u.id === userId)
    if (user) user.preferencesJson = { ...(user.preferencesJson as object), [key]: { ...((user.preferencesJson as Record<string, object>)?.[key] ?? {}), ...patch } }
  },
}))

import { findBackupOwner, getBackupStatus, readLastRun, recordLastRun, updateBackupSettings } from "@/features/backup/services/backup-config.service"

beforeEach(() => {
  m.users = [
    { id: "admin", role: "SUPERADMIN", status: "ACTIVE", preferencesJson: { notifications: { timezone: "America/New_York" }, backup: { enabled: true, driveGrantedAt: "2026-09-05T00:00:00Z" } }, createdAt: new Date("2026-01-01") },
    { id: "u2", role: "USER", status: "ACTIVE", preferencesJson: {}, createdAt: new Date("2026-02-01") },
  ]
  m.connection = { telegramChatId: BigInt("123456") }
  m.secrets = new Map()
  m.merged = []
})

describe("findBackupOwner", () => {
  it("é o SUPERADMIN ativo mais antigo, com fuso das notificações, chat do Telegram e idioma", async () => {
    const owner = await findBackupOwner()
    expect(owner).toMatchObject({ userId: "admin", timezone: "America/New_York", chatId: "123456", locale: "en-US" })
    expect(owner?.preferences.enabled).toBe(true)
  })
  it("sem SUPERADMIN ativo, null", async () => {
    m.users[0].status = "PENDING"
    expect(await findBackupOwner()).toBeNull()
  })
  it("sem Telegram, chatId null e o resto segue", async () => {
    m.connection = null
    expect((await findBackupOwner())?.chatId).toBeNull()
  })
})

describe("updateBackupSettings", () => {
  it("grava só os campos da tela, por mesclagem, sem tocar driveGrantedAt", async () => {
    const next = await updateBackupSettings("admin", { enabled: false, hour: 22, minute: 15, keep: 45 })
    expect(next).toMatchObject({ enabled: false, hour: 22, minute: 15, keep: 45, driveGrantedAt: "2026-09-05T00:00:00Z" })
    expect(m.merged[0]).toEqual({ userId: "admin", key: "backup", patch: { enabled: false, hour: 22, minute: 15, keep: 45 } })
  })
})

describe("último resultado em app_settings", () => {
  it("vai e volta como JSON cifrado; sem nada gravado, null", async () => {
    expect(await readLastRun()).toBeNull()
    await recordLastRun({ at: "2026-09-05T07:01:00Z", ok: true, fileName: "wiseveo-app-20260905-0300.dump", sizeBytes: 271679, message: null })
    expect(await readLastRun()).toEqual({ at: "2026-09-05T07:01:00Z", ok: true, fileName: "wiseveo-app-20260905-0300.dump", sizeBytes: 271679, message: null })
    expect(m.secrets.has("backup.lastRun")).toBe(true)
  })
})

describe("getBackupStatus", () => {
  it("monta a view do cartão sem chamar o Drive", async () => {
    const view = await getBackupStatus()
    expect(view).toEqual({
      driveConnected: true,
      enabled: true,
      hour: 3,
      minute: 0,
      keep: 30,
      timezone: "America/New_York",
      lastRun: null,
      folderId: null,
    })
  })
})
