import fs from "node:fs"
import path from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Rotas que gravam dados da PESSOA (preferências, Telegram, chat do consultor) têm de sair da
 * sessão, nunca do atalho de leitura `getSettingsUserId`, que fora de produção cai no usuário
 * mais antigo do banco quando não há sessão. Aqui o atalho é simulado devolvendo "antigo": se
 * alguma rota de escrita ainda o usar, a gravação cai em "antigo" e o teste acusa.
 */
const m = vi.hoisted(() => ({
  sessionUserId: null as string | null,
  settingsCalls: 0,
  writes: [] as Array<{ fn: string; userId: unknown }>,
}))

vi.mock("@/lib/session", () => ({
  getSessionUserId: async () => m.sessionUserId,
  getSession: async () => (m.sessionUserId ? { userId: m.sessionUserId, demoShared: false } : null),
}))
vi.mock("@/features/settings/services/get-settings-user-id", () => ({
  getSettingsUserId: async () => {
    m.settingsCalls += 1
    return "antigo"
  },
}))
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }))
vi.mock("@/features/settings/services/user-settings-service", () => ({
  getUserLocale: async () => "pt-BR",
  getUserMonetarySettings: async (userId: string) => {
    m.writes.push({ fn: "getUserMonetarySettings", userId })
    return {}
  },
  updateUserMonetarySettings: async (userId: string) => {
    m.writes.push({ fn: "updateUserMonetarySettings", userId })
    return {}
  },
  getQuickPaymentOptions: async () => ({ accounts: [], statuses: [] }),
  getUserQuickPaymentSettings: async () => ({}),
  updateUserQuickPaymentSettings: async (userId: string) => {
    m.writes.push({ fn: "updateUserQuickPaymentSettings", userId })
    return {}
  },
  getUserAppearanceSettings: async () => ({}),
  updateUserAppearance: async (userId: string) => {
    m.writes.push({ fn: "updateUserAppearance", userId })
    return { themePreferences: null }
  },
  setUserLocale: async (userId: string) => {
    m.writes.push({ fn: "setUserLocale", userId })
  },
  getUserRadarPreferences: async () => ({}),
  updateUserRadarPreferences: async (userId: string) => {
    m.writes.push({ fn: "updateUserRadarPreferences", userId })
    return {}
  },
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    telegramPendingToken: {
      deleteMany: async () => ({ count: 0 }),
      create: async (args: { data: { userId: string } }) => {
        m.writes.push({ fn: "telegramPendingToken.create", userId: args.data.userId })
        return args.data
      },
    },
    telegramConnection: {
      deleteMany: async (args: { where: { userId: string } }) => {
        m.writes.push({ fn: "telegramConnection.deleteMany", userId: args.where.userId })
        return { count: 0 }
      },
    },
    user: { findUnique: async () => ({ name: "Pessoa" }) },
  },
}))
vi.mock("@/features/telegram/services/telegram-config.service", () => ({
  getTelegramBotConfig: async () => ({ botUsername: "bot" }),
}))
vi.mock("@/features/telegram/services/conversation-history.service", () => ({
  forgetTelegramConversation: async () => {},
}))
vi.mock("@/features/ai/services/llm.service", () => ({ AiNotConfiguredError: class extends Error {} }))
vi.mock("@/features/ai/services/ai-usage.service", () => ({ AiBudgetExceededError: class extends Error {} }))
vi.mock("@/features/ai/types/response.types", () => ({ blocksToPlainText: () => "" }))
vi.mock("@/features/ai/services/response-composer.service", () => ({
  composeAnswer: async (input: { ctx: { viewerId: string } }) => {
    m.writes.push({ fn: "composeAnswer", userId: input.ctx.viewerId })
    return []
  },
}))
vi.mock("@/features/advisor/services/advisor-chat.service", () => ({
  getConversation: async () => [],
  toAgentHistory: () => [],
  appendToConversation: async (input: { userId: string }) => {
    m.writes.push({ fn: "appendToConversation", userId: input.userId })
  },
}))
vi.mock("@/lib/data-owner", () => ({ resolveDataOwnerId: async (id: string) => id }))
vi.mock("@/lib/theme-preferences", () => ({ normalizeThemePreferences: (body: unknown) => body }))

import { POST as advisorChat } from "@/app/api/advisor/chat/route"
import { POST as telegramConnect } from "@/app/api/telegram/connect/route"
import { DELETE as telegramDisconnect } from "@/app/api/telegram/disconnect/route"
import { GET as generalGet, PUT as generalPut } from "@/app/api/user/general-preferences/route"
import { GET as monetaryGet, PUT as monetaryPut } from "@/app/api/user/monetary-preferences/route"
import { PATCH as preferencesPatch, PUT as preferencesPut } from "@/app/api/user/preferences/route"
import { PUT as radarPut } from "@/app/api/user/radar-preferences/route"

const READS = new Set(["getUserMonetarySettings"])
const json = (body: unknown, method: string) =>
  new Request("http://localhost/api/x", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

const writesDone = () => m.writes.filter((w) => !READS.has(w.fn))

/** Uma entrada por rota de escrita: como chamar e qual gravação prova que ela rodou. */
const WRITE_ROUTES: Array<{ name: string; call: () => Promise<Response>; writeFn: string }> = [
  {
    name: "POST /api/advisor/chat",
    call: () => advisorChat(json({ question: "Quanto gastei?", conversationId: "c1" }, "POST")),
    writeFn: "appendToConversation",
  },
  { name: "POST /api/telegram/connect", call: () => telegramConnect(), writeFn: "telegramPendingToken.create" },
  { name: "DELETE /api/telegram/disconnect", call: () => telegramDisconnect(), writeFn: "telegramConnection.deleteMany" },
  {
    name: "PUT /api/user/general-preferences",
    call: () => generalPut(json({ defaultAccountId: 1, defaultStatusCode: 1 }, "PUT")),
    writeFn: "updateUserQuickPaymentSettings",
  },
  { name: "PUT /api/user/monetary-preferences", call: () => monetaryPut(json({}, "PUT")), writeFn: "updateUserMonetarySettings" },
  { name: "PUT /api/user/preferences", call: () => preferencesPut(json({}, "PUT")), writeFn: "updateUserAppearance" },
  { name: "PATCH /api/user/preferences", call: () => preferencesPatch(json({ locale: "en-US" }, "PATCH")), writeFn: "setUserLocale" },
  {
    name: "PUT /api/user/radar-preferences",
    call: () =>
      radarPut(json({ mode: "lookahead", horizonDays: 30, green: 300, amber: null, red: 100 }, "PUT")),
    writeFn: "updateUserRadarPreferences",
  },
]

beforeEach(() => {
  m.sessionUserId = null
  m.settingsCalls = 0
  m.writes = []
  delete process.env.NEXT_PUBLIC_DEMO_MODE
})

describe.each(WRITE_ROUTES)("$name", ({ call, writeFn }) => {
  it("sem sessão responde 401 e não grava, mesmo com o atalho de leitura devolvendo alguém", async () => {
    const res = await call()
    expect(res.status).toBe(401)
    expect(writesDone()).toEqual([])
    expect(m.settingsCalls).toBe(0)
  })

  it("com sessão grava na pessoa da sessão, nunca no usuário mais antigo", async () => {
    m.sessionUserId = "u1"
    const res = await call()
    expect(res.status).toBeLessThan(300)
    const done = writesDone()
    expect(done.map((w) => w.fn)).toContain(writeFn)
    expect(done.every((w) => w.userId === "u1")).toBe(true)
    expect(m.settingsCalls).toBe(0)
  })
})

describe("as leituras continuam pelo atalho (é para isso que ele existe)", () => {
  it("GET monetary-preferences e general-preferences sem sessão ainda respondem pelo atalho", async () => {
    expect((await monetaryGet()).status).toBe(200)
    expect((await generalGet()).status).toBe(200)
    expect(m.settingsCalls).toBe(2)
    expect(m.writes.every((w) => READS.has(w.fn))).toBe(true)
  })
})

describe("catraca: nenhum handler de escrita dessas rotas chama o atalho de leitura", () => {
  const ROOT = process.cwd()
  const FILES = [
    "src/app/api/advisor/chat/route.ts",
    "src/app/api/telegram/connect/route.ts",
    "src/app/api/telegram/disconnect/route.ts",
    "src/app/api/user/general-preferences/route.ts",
    "src/app/api/user/monetary-preferences/route.ts",
    "src/app/api/user/preferences/route.ts",
    "src/app/api/user/radar-preferences/route.ts",
  ]
  // Agulha montada em partes para a própria varredura não se achar.
  const NEEDLE = ["getSettings", "UserId("].join("")

  function writeHandlers(source: string): string[] {
    const parts = source.split(/(?=export async function (?:GET|POST|PUT|PATCH|DELETE)\b)/)
    return parts.filter((part) => /^export async function (?:POST|PUT|PATCH|DELETE)\b/.test(part))
  }

  it("a agulha acha o atalho de verdade", () => {
    const definition = fs.readFileSync(path.join(ROOT, "src/features/settings/services/get-settings-user-id.ts"), "utf8")
    expect(definition).toContain(NEEDLE)
  })

  it.each(FILES)("%s", (file) => {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8")
    const handlers = writeHandlers(source)
    expect(handlers.length).toBeGreaterThan(0)
    for (const handler of handlers) {
      expect(handler, `handler de escrita em ${file} ainda usa o atalho de leitura`).not.toContain(NEEDLE)
    }
  })
})
