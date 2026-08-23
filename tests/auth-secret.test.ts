import { describe, expect, it } from "vitest"
import { deriveSessionKey, futureSessionSource, getSessionKey, sessionSecretSource } from "../src/lib/auth-secret"

/**
 * A chave que assina o "crachá" da sessão deixou de ser uma variável a colar no
 * painel da hospedagem: por padrão ela é calculada a partir da própria URL do banco.
 * Instalações que já têm AUTH_SECRET continuam valendo (a env vence).
 */
const env = (values: Record<string, string | undefined>) => values as NodeJS.ProcessEnv

describe("sessionSecretSource", () => {
  it("AUTH_SECRET vence a URL do banco (instalações antigas seguem funcionando)", () => {
    expect(sessionSecretSource(env({ AUTH_SECRET: "segredo", DATABASE_URL: "postgresql://a" }))).toBe("segredo")
  })

  it("sem AUTH_SECRET, a origem é a URL do banco", () => {
    expect(sessionSecretSource(env({ DATABASE_URL: "postgresql://a" }))).toBe("postgresql://a")
  })

  it("sem nada configurado, cai no fallback de desenvolvimento", () => {
    expect(sessionSecretSource(env({}))).toBe("fallback-secret-change-me")
  })
})

describe("deriveSessionKey", () => {
  it("mesma origem → mesma chave de 32 bytes (o crachá sobrevive a reinícios)", async () => {
    const a = await deriveSessionKey("postgresql://u:p@h/db")
    const b = await deriveSessionKey("postgresql://u:p@h/db")
    expect(a.length).toBe(32)
    expect([...a]).toEqual([...b])
  })

  it("trocar a senha do banco muda a chave (as sessões abertas caem)", async () => {
    const antes = await deriveSessionKey("postgresql://u:senha1@h/db")
    const depois = await deriveSessionKey("postgresql://u:senha2@h/db")
    expect([...antes]).not.toEqual([...depois])
  })

  it("a chave não contém a URL em claro", async () => {
    const url = "postgresql://u:p@h/db"
    const key = await deriveSessionKey(url)
    expect(Buffer.from(key).toString("utf8")).not.toContain("postgresql")
  })
})

describe("getSessionKey", () => {
  it("acompanha a origem: mudou a URL, muda a chave", async () => {
    const a = await getSessionKey(env({ DATABASE_URL: "postgresql://a" }))
    const b = await getSessionKey(env({ DATABASE_URL: "postgresql://b" }))
    const aDeNovo = await getSessionKey(env({ DATABASE_URL: "postgresql://a" }))
    expect([...a]).not.toEqual([...b])
    expect([...a]).toEqual([...aDeNovo])
  })
})

describe("futureSessionSource", () => {
  it("é a URL recém-conectada — o Finalizar assina para DEPOIS do redeploy", () => {
    expect(futureSessionSource("postgresql://nova", env({}))).toBe("postgresql://nova")
  })

  it("mas respeita um AUTH_SECRET que já exista na hospedagem", () => {
    expect(futureSessionSource("postgresql://nova", env({ AUTH_SECRET: "segredo" }))).toBe("segredo")
  })
})
