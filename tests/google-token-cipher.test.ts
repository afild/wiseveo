import { describe, expect, it } from "vitest"
import { encryptGoogleToken, readGoogleToken } from "../src/lib/google-token-cipher"
import { decryptSecret, encryptSecret } from "../src/lib/secret-cipher"

/**
 * Os tokens da Agenda do Google davam acesso ao calendário da pessoa e ficavam EM CLARO
 * nas colunas `google_access_token` / `google_refresh_token`. Agora são cifrados, com a
 * mesma cifra autenticada dos segredos de `app_settings`, mas com RÓTULO PRÓPRIO.
 *
 * A promessa dupla deste módulo:
 *  1. o que ele grava nunca é legível;
 *  2. o que já estava gravado em claro continua funcionando (o banco pessoal tem anos de
 *     uso e ninguém vai rodar migração de dados aqui: o código se adapta ao banco).
 */
const SOURCE = "postgresql://user:pass@host:5432/db"
const ACCESS = "ya29.a0AfB_by-token-de-acesso-do-google"
const REFRESH = "1//0e-refresh-token-do-google"

describe("encryptGoogleToken", () => {
  it("nunca deixa o token legível e muda a cada cifragem (IV aleatório)", () => {
    const a = encryptGoogleToken(REFRESH, SOURCE)
    const b = encryptGoogleToken(REFRESH, SOURCE)
    expect(a).not.toContain(REFRESH)
    expect(a).not.toContain("1//")
    expect(a).not.toBe(b)
  })

  it("ida e volta com a mesma origem", () => {
    expect(readGoogleToken(encryptGoogleToken(ACCESS, SOURCE), SOURCE)).toBe(ACCESS)
  })
})

describe("readGoogleToken", () => {
  it("token antigo, gravado em claro, continua sendo lido tal como está", () => {
    expect(readGoogleToken(ACCESS, SOURCE)).toBe(ACCESS)
    expect(readGoogleToken(REFRESH, SOURCE)).toBe(REFRESH)
  })

  it("nada gravado devolve null", () => {
    expect(readGoogleToken(null, SOURCE)).toBeNull()
    expect(readGoogleToken("", SOURCE)).toBeNull()
  })

  it("origem trocada (senha do banco mudou) devolve null, não lixo", () => {
    const guardado = encryptGoogleToken(REFRESH, SOURCE)
    expect(readGoogleToken(guardado, "outra-origem")).toBeNull()
  })

  it("valor adulterado devolve null (a cifra é autenticada)", () => {
    const partes = encryptGoogleToken(REFRESH, SOURCE).split(":")
    partes[3] = partes[3].endsWith("aa") ? partes[3].slice(0, -2) + "bb" : partes[3].slice(0, -2) + "aa"
    expect(readGoogleToken(partes.join(":"), SOURCE)).toBeNull()
  })
})

describe("isolamento de chaves", () => {
  /**
   * Regra da casa: rótulo próprio por finalidade. Se um dia o mesmo rótulo for usado nos
   * dois lugares, quem conseguisse ler `app_settings` passaria a ler os tokens do Google
   * com a mesma chave. Este teste quebra nesse dia.
   */
  it("token do Google não decifra com a chave dos segredos do app, e vice-versa", () => {
    expect(decryptSecret(encryptGoogleToken(REFRESH, SOURCE), SOURCE)).toBeNull()
    expect(readGoogleToken(encryptSecret(REFRESH, SOURCE), SOURCE)).toBeNull()
  })
})
