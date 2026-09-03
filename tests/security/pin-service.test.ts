import { beforeEach, describe, expect, it, vi } from "vitest"

import { sqlText } from "./helpers/sql-text"

/**
 * PIN do fechamento de datas: o contador de erros mora no BANCO (rajada em paralelo não pula o
 * bloqueio) e o token de autorização nasce de uma chave própria, que a sessão nunca abre.
 */
const m = vi.hoisted(() => ({
  prefs: {} as Record<string, unknown>,
  bump: { count: 1, locked_until: null as string | null },
  raw: [] as string[],
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = sqlText(strings, values); m.raw.push(sql)
      if (sql.includes("information_schema")) return [{ data_type: "jsonb" }]
      if (sql.includes("RETURNING")) return [m.bump]
      return [{ dc: m.prefs.dateClosing ?? null }]
    },
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => { m.raw.push(sqlText(strings, values)); return 1 },
  },
}))

import bcrypt from "bcryptjs"
import { issueOverrideToken, setPin, verifyOverrideToken, verifyPin } from "@/features/security/services/pin.service"
import { verifySessionToken } from "@/lib/auth"

beforeEach(async () => {
  m.raw = []
  m.bump = { count: 1, locked_until: null }
  m.prefs = { dateClosing: { pinHash: await bcrypt.hash("1234", 4), pinFailures: { count: 0, lockedUntil: null } } }
})

describe("verifyPin", () => {
  it("PIN certo devolve ok e zera o contador", async () => {
    expect(await verifyPin("dono", "1234")).toEqual({ ok: true })
    expect(m.raw.some((s) => s.includes("jsonb_build_object") && s.includes("dateClosing"))).toBe(true)
  })
  it("PIN errado conta a tentativa ANTES de comparar e informa quantas restam", async () => {
    m.bump = { count: 2, locked_until: null }
    expect(await verifyPin("dono", "0000")).toEqual({ ok: false, reason: "invalid", attemptsLeft: 3 })
  })
  it("quinto erro bloqueia por 15 minutos", async () => {
    m.bump = { count: 5, locked_until: "2099-01-01T00:00:00.000Z" }
    expect(await verifyPin("dono", "0000")).toMatchObject({ ok: false, reason: "locked" })
  })
  it("bloqueado não compara nem incrementa", async () => {
    m.prefs = { dateClosing: { pinHash: "h", pinFailures: { count: 5, lockedUntil: "2099-01-01T00:00:00.000Z" } } }
    expect(await verifyPin("dono", "1234")).toMatchObject({ ok: false, reason: "locked" })
    expect(m.raw.some((s) => s.includes("RETURNING"))).toBe(false)
  })
  it("bloqueio vencido zera o contador antes de contar a nova tentativa (5 tentativas de novo)", async () => {
    m.prefs = { dateClosing: { pinHash: await bcrypt.hash("1234", 4), pinFailures: { count: 5, lockedUntil: "2000-01-01T00:00:00.000Z" } } }
    m.bump = { count: 1, locked_until: null }
    expect(await verifyPin("dono", "0000")).toEqual({ ok: false, reason: "invalid", attemptsLeft: 4 })
    const zeroIndex = m.raw.findIndex((s) => s.includes(JSON.stringify({ pinFailures: { count: 0, lockedUntil: null } })))
    const bumpIndex = m.raw.findIndex((s) => s.includes("RETURNING"))
    expect(zeroIndex).toBeGreaterThan(-1)
    expect(zeroIndex).toBeLessThan(bumpIndex)
  })
  it("token sem iat é recusado", async () => {
    const { SignJWT } = await import("jose")
    const { getOverrideKey } = await import("@/lib/auth-secret")
    const token = await new SignJWT({ purpose: "date-closing-override", ownerId: "dono", userId: "dono" })
      .setProtectedHeader({ alg: "HS256" }).setExpirationTime("2m").sign(await getOverrideKey())
    expect(await verifyOverrideToken(token)).toBeNull()
  })
  it("sem PIN definido responde pinNotSet", async () => {
    m.prefs = {}
    expect(await verifyPin("dono", "1234")).toEqual({ ok: false, reason: "pinNotSet" })
  })
})

describe("setPin", () => {
  it("recusa o que não é 4 dígitos", async () => {
    await expect(setPin({ $queryRaw: async () => [{ data_type: "jsonb" }], $executeRaw: async () => 1 } as never, "dono", "12a4")).rejects.toMatchObject({ code: "pinInvalid" })
  })
})

describe("token de override", () => {
  it("emite e verifica com todos os claims; nunca vale como sessão", async () => {
    const { token, expiresAt } = await issueOverrideToken({ ownerId: "dono", userId: "admin" })
    expect(Date.parse(expiresAt)).toBeGreaterThan(Date.now())
    expect(await verifyOverrideToken(token)).toEqual({ ownerId: "dono", userId: "admin" })
    expect(await verifySessionToken(token)).toBeNull()
  })
  it("um token de sessão não vale como override", async () => {
    const { createSessionToken } = await import("@/lib/auth")
    expect(await verifyOverrideToken(await createSessionToken("dono"))).toBeNull()
  })
})
