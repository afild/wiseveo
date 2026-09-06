import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  owner: null as null | Record<string, unknown>,
  claimed: true,
  ledger: [] as string[],
  token: "ya29.x" as string | null,
  dump: { dump: Buffer.alloc(200_000, 1), toc: "", pgDumpVersion: "pg_dump (PostgreSQL) 18.6", durationMs: 90_000 },
  toc: "",
  files: [] as Array<{ id: string; name: string; sizeBytes: number; createdAt: string }>,
  uploaded: [] as string[],
  deleted: [] as string[],
  lastRun: null as unknown,
  messages: [] as string[],
  folder: null as string | null,
}))

vi.mock("@/features/backup/services/backup-config.service", () => ({
  findBackupOwner: async () => m.owner,
  readFolderId: async () => m.folder,
  saveFolderId: async (id: string) => {
    m.folder = id
  },
  recordLastRun: async (run: unknown) => {
    m.lastRun = run
  },
  BACKUP_FOLDER_NAME: "WISEVEO Backups",
}))
vi.mock("@/features/notifications/services/delivery-ledger.service", () => ({
  claimDelivery: async () => m.claimed,
  markDelivered: async (_r: unknown, d: string) => {
    m.ledger.push(`sent:${d}`)
  },
  markFailed: async (_r: unknown, d: string) => {
    m.ledger.push(`failed:${d}`)
  },
}))
vi.mock("@/lib/google-auth", () => ({ getValidAccessToken: async () => m.token }))
vi.mock("@/features/backup/services/sandbox-dump.service", () => ({
  runPgDumpInSandbox: async () => ({ ...m.dump, toc: m.toc }),
}))
vi.mock("@/features/backup/services/google-drive.client", () => ({
  createDriveClient: () => ({
    ensureFolder: async () => "pasta-1",
    uploadFile: async ({ name }: { name: string }) => {
      m.uploaded.push(name)
      return { id: "novo", name, sizeBytes: 200_000, createdAt: "2026-09-05T07:00:00Z" }
    },
    listFiles: async () => m.files,
    deleteFile: async (id: string) => {
      m.deleted.push(id)
    },
  }),
}))
vi.mock("@/features/notifications/services/notification-channel.service", () => ({
  sendTextNotification: async (_chat: string, text: string) => {
    m.messages.push(text)
  },
}))
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string, values?: Record<string, unknown>) => `${key}${values ? ":" + Object.values(values).join(",") : ""}`,
}))

import { runBackup } from "@/features/backup/services/run-backup.service"

const goodToc = [...Array.from({ length: 160 }, (_, i) => `${i + 1}; 0 0 TABLE public t${i} postgres`), "999; 0 0 TABLE DATA public transactions postgres"].join("\n")
const NOW = new Date("2026-09-05T07:30:00Z") // 03:30 em Nova York

beforeEach(() => {
  m.owner = {
    userId: "admin",
    preferences: { enabled: true, hour: 3, minute: 0, keep: 30, driveGrantedAt: "2026-09-01T00:00:00Z" },
    timezone: "America/New_York",
    locale: "pt-BR",
    chatId: "123",
  }
  m.claimed = true
  m.ledger = []
  m.token = "ya29.x"
  m.toc = goodToc
  m.files = []
  m.uploaded = []
  m.deleted = []
  m.lastRun = null
  m.messages = []
  m.folder = null
  vi.stubEnv("DATABASE_URL", "postgresql://postgres.ref:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true")
})

describe("runBackup pelo despertador", () => {
  it("caminho feliz: reserva, gera, confere, envia, guarda a pasta, registra e avisa", async () => {
    const out = await runBackup({ trigger: "tick", now: NOW })
    expect(out).toMatchObject({ outcome: "sent", occurrenceKey: "2026-09-05" })
    expect(m.uploaded).toEqual(["wiseveo-app-20260905-0330.dump"])
    expect(m.folder).toBe("pasta-1")
    expect(m.ledger[0]).toMatch(/^sent:/)
    expect(m.lastRun).toMatchObject({ ok: true, fileName: "wiseveo-app-20260905-0330.dump", sizeBytes: 200_000 })
    expect(m.messages[0]).toMatch(/^backup\.ok:/)
  })

  it("fora do horário: nada reservado, nada gerado", async () => {
    const out = await runBackup({ trigger: "tick", now: new Date("2026-09-05T06:00:00Z") })
    expect(out).toEqual({ outcome: "skipped", reason: "notYet" })
    expect(m.uploaded).toEqual([])
    expect(m.ledger).toEqual([])
  })

  it("já reservado hoje (batida duplicada): pula sem gerar", async () => {
    m.claimed = false
    expect(await runBackup({ trigger: "tick", now: NOW })).toEqual({ outcome: "skipped", reason: "alreadyClaimed" })
    expect(m.uploaded).toEqual([])
  })

  it("dump que não passa na conferência: não sobe, marca falha, avisa, e a cópia anterior fica", async () => {
    m.toc = "1; 0 0 TABLE public x postgres"
    m.files = [{ id: "velho", name: "a.dump", sizeBytes: 1, createdAt: "2026-08-01T00:00:00Z" }]
    const out = await runBackup({ trigger: "tick", now: NOW })
    expect(out).toMatchObject({ outcome: "failed", code: "dumpRejected" })
    expect(m.uploaded).toEqual([])
    expect(m.deleted).toEqual([])
    expect(m.ledger[0]).toMatch(/^failed:dumpRejected/)
    expect(m.messages[0]).toMatch(/^backup\.failed:/)
    expect(m.lastRun).toMatchObject({ ok: false })
  })

  it("token do Google indisponível: driveNotConnected, sem abrir sandbox", async () => {
    m.token = null
    expect(await runBackup({ trigger: "tick", now: NOW })).toMatchObject({ outcome: "failed", code: "driveNotConnected" })
    expect(m.uploaded).toEqual([])
  })

  it("retenção: apaga as mais velhas além de keep, nunca o que acabou de subir", async () => {
    m.owner = { ...(m.owner as object), preferences: { enabled: true, hour: 3, minute: 0, keep: 7, driveGrantedAt: "x" } } as never
    m.files = Array.from({ length: 9 }, (_, i) => ({ id: `f${i}`, name: `f${i}.dump`, sizeBytes: 1, createdAt: `2026-08-${String(i + 1).padStart(2, "0")}T00:00:00Z` }))
    await runBackup({ trigger: "tick", now: NOW })
    expect(m.deleted).toEqual(["f0", "f1"])
  })

  it("sem Telegram, o resultado é o mesmo e nenhuma mensagem sai", async () => {
    m.owner = { ...(m.owner as object), chatId: null } as never
    expect((await runBackup({ trigger: "tick", now: NOW })).outcome).toBe("sent")
    expect(m.messages).toEqual([])
  })
})

describe("runBackup à mão", () => {
  it("roda desligado e fora do horário, com chave própria", async () => {
    m.owner = { ...(m.owner as object), preferences: { enabled: false, hour: 3, minute: 0, keep: 30, driveGrantedAt: "x" } } as never
    const out = await runBackup({ trigger: "manual", now: new Date("2026-09-05T01:07:00Z") })
    expect(out).toMatchObject({ outcome: "sent", occurrenceKey: "2026-09-04-manual-2107" })
  })
})
