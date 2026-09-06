import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const m = vi.hoisted(() => ({
  sessionUserId: "admin" as string | null,
  role: "SUPERADMIN",
  status: { driveConnected: true, enabled: false, hour: 3, minute: 0, keep: 30, timezone: "America/New_York", lastRun: null, folderId: "pasta-1" },
  updates: [] as unknown[],
  runs: [] as string[],
  files: [{ id: "a", name: "a.dump", sizeBytes: 10, createdAt: "2026-09-01T00:00:00Z" }],
}))

vi.mock("@/lib/session", () => ({ getSessionUserId: async () => m.sessionUserId }))
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: async () => (m.sessionUserId ? { role: m.role, status: "ACTIVE" } : null) } } }))
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }))
vi.mock("@/features/backup/services/backup-config.service", () => ({
  getBackupStatus: async () => m.status,
  updateBackupSettings: async (_u: string, input: unknown) => {
    m.updates.push(input)
    return { ...m.status, ...(input as object) }
  },
}))
vi.mock("@/features/backup/services/run-backup.service", () => ({
  runBackup: async (input: { trigger: string }) => {
    m.runs.push(input.trigger)
    return { outcome: "sent", occurrenceKey: "k", fileName: "f.dump", sizeBytes: 1, objects: 196, durationMs: 1 }
  },
}))
vi.mock("@/lib/google-auth", () => ({ getValidAccessToken: async () => "ya29.x" }))
vi.mock("@/features/backup/services/google-drive.client", () => ({
  createDriveClient: () => ({ listFiles: async () => m.files }),
}))

import { GET, POST, PUT } from "@/app/api/admin/backup/route"

const url = "https://app.wiseveo.com/api/admin/backup"
const json = (method: string, body: unknown) => new NextRequest(url, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } })

beforeEach(() => {
  m.sessionUserId = "admin"
  m.role = "SUPERADMIN"
  m.updates = []
  m.runs = []
  delete process.env.NEXT_PUBLIC_DEMO_MODE
})

describe("guarda", () => {
  it("demo e não-SUPERADMIN recebem 404 em GET, PUT e POST", async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "true"
    expect((await GET()).status).toBe(404)
    delete process.env.NEXT_PUBLIC_DEMO_MODE
    m.role = "ADMIN"
    expect((await GET()).status).toBe(404)
    expect((await PUT(json("PUT", { enabled: true, hour: 3, minute: 0, keep: 30 }))).status).toBe(404)
    expect((await POST()).status).toBe(404)
    expect(m.updates).toEqual([])
    expect(m.runs).toEqual([])
  })
})

describe("GET", () => {
  it("devolve a view e a lista de arquivos do Drive", async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, data: { ...m.status, files: m.files } })
  })
})

describe("PUT", () => {
  it("valida e grava", async () => {
    const res = await PUT(json("PUT", { enabled: true, hour: 22, minute: 45, keep: 60 }))
    expect(res.status).toBe(200)
    expect(m.updates).toEqual([{ enabled: true, hour: 22, minute: 45, keep: 60 }])
  })
  it("recusa minuto fora das batidas e keep fora da faixa com invalidPayload", async () => {
    const res = await PUT(json("PUT", { enabled: true, hour: 22, minute: 7, keep: 60 }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ success: false, code: "invalidPayload", message: "invalidPayload" })
    expect((await PUT(json("PUT", { enabled: true, hour: 22, minute: 0, keep: 2 }))).status).toBe(400)
    expect(m.updates).toEqual([])
  })
})

describe("POST (fazer agora)", () => {
  it("roda à mão e devolve o resultado", async () => {
    const res = await POST()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ success: true, data: { outcome: "sent", fileName: "f.dump" } })
    expect(m.runs).toEqual(["manual"])
  })
})
