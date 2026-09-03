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

import { readFile } from "node:fs/promises"
import bcrypt from "bcryptjs"
import { issueOverrideToken, setPin, verifyOverrideToken, verifyPin } from "@/features/security/services/pin.service"
import { verifySessionToken } from "@/lib/auth"

/** A instrução travada que conta a tentativa (a única que decide o contador). */
const isBump = (sql: string) => sql.includes("FOR UPDATE") && sql.includes("calc.p")
/** O zeramento explícito do acerto: patch com o contador em 0. */
const ZERO_PATCH = JSON.stringify({ pinFailures: { count: 0, lockedUntil: null } })
const isZeroing = (sql: string) => sql.includes(ZERO_PATCH)
/** Qualquer instrução que grave o contador (a travada ou o zeramento). */
const touchesCounter = (sql: string) => isBump(sql) || isZeroing(sql)

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
  /**
   * O que prende a ORDEM. Enquanto isto só era cobrado no caminho do erro, mover o incremento para
   * dentro do `if (!matches)` deixava os dez testes verdes: o duplo devolvia o mesmo número fosse
   * chamado antes ou depois. Contar ANTES de comparar significa que o acerto também é contado — e é
   * só nesse caso que a instrução travada aparece antes do zeramento.
   */
  it("PIN CERTO também emite a instrução travada, e antes do zeramento", async () => {
    expect(await verifyPin("dono", "1234")).toEqual({ ok: true })
    const bumpIndex = m.raw.findIndex(isBump)
    const zeroIndex = m.raw.findIndex(isZeroing)
    expect(bumpIndex).toBeGreaterThan(-1)
    expect(zeroIndex).toBeGreaterThan(bumpIndex)
  })
  it("PIN errado conta a tentativa ANTES de comparar e informa quantas restam", async () => {
    m.bump = { count: 2, locked_until: null }
    expect(await verifyPin("dono", "0000")).toEqual({ ok: false, reason: "invalid", attemptsLeft: 3 })
  })
  for (const bad of ["abcd", "", "12345"]) {
    it(`entrada fora da régua (${JSON.stringify(bad)}) também queima uma tentativa`, async () => {
      m.bump = { count: 2, locked_until: null }
      expect(await verifyPin("dono", bad)).toEqual({ ok: false, reason: "invalid", attemptsLeft: 3 })
      expect(m.raw.filter(isBump).length).toBe(1)
    })
  }
  it("quinto erro bloqueia por 15 minutos", async () => {
    m.bump = { count: 5, locked_until: "2099-01-01T00:00:00.000Z" }
    expect(await verifyPin("dono", "0000")).toMatchObject({ ok: false, reason: "locked" })
  })
  it("bloqueado não compara nem incrementa", async () => {
    m.prefs = { dateClosing: { pinHash: "h", pinFailures: { count: 5, lockedUntil: "2099-01-01T00:00:00.000Z" } } }
    expect(await verifyPin("dono", "1234")).toMatchObject({ ok: false, reason: "locked" })
    expect(m.raw.some((s) => s.includes("calc.p"))).toBe(false)
  })
  /**
   * O zeramento avulso do bloqueio vencido era um UPDATE fora da trava: numa rajada, `zera₁, conta₁,
   * zera₂, conta₂, …` prendia o contador em 1, e um pedido atrasado ainda podia apagar um bloqueio
   * recém-armado. A expiração agora é resolvida dentro da instrução travada — daí a tentativa gastar
   * UMA instrução de contador, não duas.
   */
  it("bloqueio vencido gasta UMA instrução (a travada), sem o zeramento avulso que abria a corrida", async () => {
    m.prefs = { dateClosing: { pinHash: await bcrypt.hash("1234", 4), pinFailures: { count: 5, lockedUntil: "2000-01-01T00:00:00.000Z" } } }
    m.bump = { count: 1, locked_until: null }
    expect(await verifyPin("dono", "0000")).toEqual({ ok: false, reason: "invalid", attemptsLeft: 4 })
    expect(m.raw.filter(touchesCounter)).toHaveLength(1)
    expect(m.raw.filter(isBump)).toHaveLength(1)
    expect(m.raw.some(isZeroing)).toBe(false)
  })
  it("todo caminho de erro gasta exatamente uma instrução de contador", async () => {
    for (const bump of [{ count: 2, locked_until: null }, { count: 5, locked_until: "2099-01-01T00:00:00.000Z" }]) {
      m.raw = []
      m.bump = bump
      await verifyPin("dono", "0000")
      expect(m.raw.filter(touchesCounter)).toHaveLength(1)
    }
  })
  /**
   * A prova de grep: fora de `bumpPinFailure`, `verifyPin` só grava o contador depois de o bcrypt
   * dizer que o PIN estava certo. Qualquer volta do zeramento amarrado ao `lockedUntil` derruba isto.
   */
  it("verifyPin não tem mais nenhuma escrita de contador ligada ao lockedUntil", async () => {
    const src = await readFile(new URL("../../src/features/security/services/pin.service.ts", import.meta.url), "utf8")
    const start = src.indexOf("export async function verifyPin")
    const body = src.slice(start, src.indexOf("\nexport ", start + 1))
    expect(body.match(/mergeUserPreferenceKey\(/g)).toHaveLength(1)
    expect(body.indexOf("bcrypt.compare")).toBeLessThan(body.indexOf("mergeUserPreferenceKey("))
    expect(body).not.toMatch(/if \(lockedUntil\)[^\n]*mergeUserPreferenceKey/)
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
