import { describe, expect, it } from "vitest"
import {
  decryptSecret,
  encryptSecret,
  futureSecretsSource,
  secretCipherSource,
} from "../src/lib/secret-cipher"

/**
 * A cifra guarda o token do bot (e, adiante, chaves de IA) no banco. As promessas:
 * ida e volta perfeita com a mesma origem, e NUNCA um valor errado — origem trocada
 * ou payload adulterado devolvem null (o app trata como "não configurado").
 */
describe("encryptSecret / decryptSecret", () => {
  const source = "postgresql://user:pass@host:5432/db"

  it("ida e volta com a mesma origem", () => {
    const payload = encryptSecret("123456:ABC-DEF_token", source)
    expect(decryptSecret(payload, source)).toBe("123456:ABC-DEF_token")
  })

  it("nunca guarda o valor às claras e cada cifragem é diferente (IV aleatório)", () => {
    const a = encryptSecret("segredo", source)
    const b = encryptSecret("segredo", source)
    expect(a).not.toContain("segredo")
    expect(a).not.toBe(b)
    expect(a.startsWith("v1:")).toBe(true)
  })

  it("origem trocada (senha do banco mudou) → null, não lixo", () => {
    const payload = encryptSecret("segredo", source)
    expect(decryptSecret(payload, "outra-origem")).toBeNull()
  })

  it("payload adulterado → null (GCM autentica)", () => {
    const payload = encryptSecret("segredo", source)
    const parts = payload.split(":")
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("aa") ? "bb" : "aa")
    expect(decryptSecret(parts.join(":"), source)).toBeNull()
  })

  it("formatos estranhos → null, sem exceção", () => {
    expect(decryptSecret("", source)).toBeNull()
    expect(decryptSecret("v1:só-um-pedaço", source)).toBeNull()
    expect(decryptSecret("v2:a:b:c", source)).toBeNull()
  })

  it("aceita valores com acentos e emojis", () => {
    const payload = encryptSecret("chave-💰-ção", source)
    expect(decryptSecret(payload, source)).toBe("chave-💰-ção")
  })
})

describe("origem da chave", () => {
  const env = (values: Record<string, string | undefined>) => values as NodeJS.ProcessEnv

  it("AUTH_SECRET vence; sem ela, vale a URL do banco", () => {
    expect(secretCipherSource(env({ AUTH_SECRET: "abc", DATABASE_URL: "url" }))).toBe("abc")
    expect(secretCipherSource(env({ DATABASE_URL: "url" }))).toBe("url")
  })

  it("futureSecretsSource espelha a regra para a URL recém-conectada do Setup", () => {
    expect(futureSecretsSource("nova-url", env({ AUTH_SECRET: "abc" }))).toBe("abc")
    expect(futureSecretsSource("nova-url", env({}))).toBe("nova-url")
  })

  it("o que o Setup cifra com a URL futura, o app decifra depois com a env em vigor", () => {
    const databaseUrl = "postgresql://user:pass@host/db"
    const gravado = encryptSecret("token", futureSecretsSource(databaseUrl, env({})))
    expect(decryptSecret(gravado, secretCipherSource(env({ DATABASE_URL: databaseUrl })))).toBe("token")
  })
})
