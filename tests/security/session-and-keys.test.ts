import { describe, expect, it, vi } from "vitest"

/**
 * O crachá da sessão e o token de autorização do fechamento de datas nascem do
 * MESMO segredo, mas de rótulos diferentes: a chave de um nunca abre o outro.
 * Além disso, a sessão recusa qualquer token que traga `purpose` — duas camadas.
 */

const m = vi.hoisted(() => ({ cookie: null as string | null }))
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "session" && m.cookie ? { value: m.cookie } : undefined) }),
}))

import { createSessionToken, verifySessionToken } from "@/lib/auth"
import { deriveKey, deriveSessionKey, getOverrideKey, getSessionKey } from "@/lib/auth-secret"
import { getSession, getSessionUserId } from "@/lib/session"
import { SignJWT } from "jose"

/** Mesmo atalho de `tests/auth-secret.test.ts`: NodeJS.ProcessEnv exige NODE_ENV. */
const env = (values: Record<string, string | undefined>) => values as NodeJS.ProcessEnv

describe("chaves derivadas", () => {
  it("deriveSessionKey continua igual a deriveKey com o rótulo antigo (sessões existentes intactas)", async () => {
    expect(await deriveSessionKey("src")).toEqual(await deriveKey("wiseveo-session-key-v1", "src"))
  })
  it("chave de override difere byte a byte da chave de sessão para a mesma origem", async () => {
    const a = await getSessionKey(env({ DATABASE_URL: "postgres://x" }))
    const b = await getOverrideKey(env({ DATABASE_URL: "postgres://x" }))
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false)
  })
})

describe("verifySessionToken", () => {
  it("recusa token que traga purpose, mesmo assinado com a chave da sessão", async () => {
    const token = await new SignJWT({ userId: "u1", purpose: "date-closing-override" })
      .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2m").sign(await getSessionKey())
    expect(await verifySessionToken(token)).toBeNull()
  })
  it("aceita a sessão normal e expõe demoShared", async () => {
    const token = await createSessionToken("u1", undefined, { demoShared: true })
    expect(await verifySessionToken(token)).toEqual({ userId: "u1", demoShared: true })
  })
})

describe("getSession", () => {
  it("devolve o payload completo e getSessionUserId continua funcionando", async () => {
    m.cookie = await createSessionToken("u2")
    expect(await getSession()).toEqual({ userId: "u2", demoShared: false })
    expect(await getSessionUserId()).toBe("u2")
    m.cookie = null
    expect(await getSession()).toBeNull()
  })
})
