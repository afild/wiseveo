import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * `getValidAccessToken` é o único leitor dos tokens da Agenda. Depois da mudança que
 * passou a cifrá-los, ele tem três obrigações que este arquivo tranca:
 *
 *  1. devolver o token EM CLARO para quem chama (a API do Google precisa dele assim),
 *     mesmo com o valor cifrado no banco;
 *  2. gravar sempre CIFRADO (nenhum `ya29.` ou `1//` volta para a coluna);
 *  3. continuar funcionando com o que já está gravado em claro, e aproveitar a próxima
 *     renovação para guardar aquilo cifrado (o banco pessoal não passa por migração).
 */
const m = vi.hoisted(() => ({
  prisma: { user: { findUnique: vi.fn(), update: vi.fn() } },
}))

vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }))

import { disconnectGoogle, getValidAccessToken } from "@/lib/google-auth"
import { encryptGoogleToken, readGoogleToken } from "@/lib/google-token-cipher"

const ACCESS_ANTIGO = "ya29.acesso-guardado"
const ACCESS_NOVO = "ya29.acesso-renovado"
const REFRESH = "1//refresh-da-agenda"
const DAQUI_UMA_HORA = new Date(Date.now() + 60 * 60 * 1000)
const JA_VENCIDO = new Date(Date.now() - 60 * 1000)

/** Junta o que foi passado em todos os `update`, para conferir o que chegou no banco. */
function dadosGravados(): Record<string, unknown> {
  return Object.assign({}, ...m.prisma.user.update.mock.calls.map((c) => c[0].data))
}

beforeEach(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "client-id")
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret")
  m.prisma.user.findUnique.mockReset()
  m.prisma.user.update.mockReset().mockResolvedValue({})
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ access_token: ACCESS_NOVO, expires_in: 3600 }), { status: 200 })),
  )
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("getValidAccessToken com os tokens cifrados", () => {
  it("token ainda válido: devolve em claro e não grava nada", async () => {
    m.prisma.user.findUnique.mockResolvedValue({
      googleAccessToken: encryptGoogleToken(ACCESS_ANTIGO),
      googleRefreshToken: encryptGoogleToken(REFRESH),
      googleTokenExpiresAt: DAQUI_UMA_HORA,
    })

    expect(await getValidAccessToken("u1")).toBe(ACCESS_ANTIGO)
    expect(m.prisma.user.update).not.toHaveBeenCalled()
  })

  it("token vencido: renova com o refresh em claro e grava o novo CIFRADO", async () => {
    m.prisma.user.findUnique.mockResolvedValue({
      googleAccessToken: encryptGoogleToken(ACCESS_ANTIGO),
      googleRefreshToken: encryptGoogleToken(REFRESH),
      googleTokenExpiresAt: JA_VENCIDO,
    })

    expect(await getValidAccessToken("u1")).toBe(ACCESS_NOVO)

    // o Google tem de receber o refresh token DECIFRADO
    const corpo = String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body)
    expect(corpo).toContain(encodeURIComponent(REFRESH))

    const gravado = dadosGravados()
    expect(gravado.googleAccessToken).not.toBe(ACCESS_NOVO)
    expect(String(gravado.googleAccessToken)).not.toContain("ya29.")
    expect(readGoogleToken(String(gravado.googleAccessToken))).toBe(ACCESS_NOVO)
  })

  it("sem conexão com a Agenda devolve null", async () => {
    m.prisma.user.findUnique.mockResolvedValue({
      googleAccessToken: null,
      googleRefreshToken: null,
      googleTokenExpiresAt: null,
    })
    expect(await getValidAccessToken("u1")).toBeNull()
  })
})

describe("tokens antigos, gravados em claro", () => {
  it("continuam valendo: o acesso em claro ainda dentro do prazo é devolvido", async () => {
    m.prisma.user.findUnique.mockResolvedValue({
      googleAccessToken: ACCESS_ANTIGO,
      googleRefreshToken: REFRESH,
      googleTokenExpiresAt: DAQUI_UMA_HORA,
    })
    expect(await getValidAccessToken("u1")).toBe(ACCESS_ANTIGO)
  })

  it("na primeira renovação o refresh em claro é regravado CIFRADO", async () => {
    m.prisma.user.findUnique.mockResolvedValue({
      googleAccessToken: ACCESS_ANTIGO,
      googleRefreshToken: REFRESH,
      googleTokenExpiresAt: JA_VENCIDO,
    })

    expect(await getValidAccessToken("u1")).toBe(ACCESS_NOVO)

    const gravado = dadosGravados()
    expect(gravado.googleRefreshToken).toBeTypeOf("string")
    expect(gravado.googleRefreshToken).not.toBe(REFRESH)
    expect(readGoogleToken(String(gravado.googleRefreshToken))).toBe(REFRESH)
  })
})

describe("acesso revogado pela pessoa na conta Google", () => {
  it("invalid_grant desconecta: limpa as três colunas e devolve null", async () => {
    m.prisma.user.findUnique.mockResolvedValue({
      googleAccessToken: encryptGoogleToken(ACCESS_ANTIGO),
      googleRefreshToken: encryptGoogleToken(REFRESH),
      googleTokenExpiresAt: JA_VENCIDO,
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })),
    )

    expect(await getValidAccessToken("u1")).toBeNull()
    expect(dadosGravados()).toEqual({
      googleAccessToken: null,
      googleRefreshToken: null,
      googleTokenExpiresAt: null,
    })
  })

  it("unauthorized_client desconecta: o token não serve mais para este app (caso real de 11/09/2026)", async () => {
    m.prisma.user.findUnique.mockResolvedValue({
      googleAccessToken: encryptGoogleToken(ACCESS_ANTIGO),
      googleRefreshToken: encryptGoogleToken(REFRESH),
      googleTokenExpiresAt: JA_VENCIDO,
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "unauthorized_client", error_description: "Unauthorized" }), { status: 401 })),
    )

    expect(await getValidAccessToken("u1")).toBeNull()
    expect(dadosGravados()).toEqual({
      googleAccessToken: null,
      googleRefreshToken: null,
      googleTokenExpiresAt: null,
    })
  })

  it("falha passageira do Google (500) NÃO desconecta: estoura e mantém os tokens", async () => {
    m.prisma.user.findUnique.mockResolvedValue({
      googleAccessToken: encryptGoogleToken(ACCESS_ANTIGO),
      googleRefreshToken: encryptGoogleToken(REFRESH),
      googleTokenExpiresAt: JA_VENCIDO,
    })
    vi.stubGlobal("fetch", vi.fn(async () => new Response("backend error", { status: 500 })))

    await expect(getValidAccessToken("u1")).rejects.toThrow(/Google token refresh failed/)
    expect(m.prisma.user.update).not.toHaveBeenCalled()
  })

  it("token guardado que não decifra (senha do banco trocada) desconecta em vez de estourar", async () => {
    m.prisma.user.findUnique.mockResolvedValue({
      googleAccessToken: encryptGoogleToken(ACCESS_ANTIGO, "origem-antiga"),
      googleRefreshToken: encryptGoogleToken(REFRESH, "origem-antiga"),
      googleTokenExpiresAt: DAQUI_UMA_HORA,
    })

    expect(await getValidAccessToken("u1")).toBeNull()
    expect(dadosGravados()).toEqual({
      googleAccessToken: null,
      googleRefreshToken: null,
      googleTokenExpiresAt: null,
    })
  })
})

describe("disconnectGoogle (botão Desconectar)", () => {
  it("avisa o Google para cancelar o acesso com o refresh DECIFRADO e limpa as três colunas", async () => {
    m.prisma.user.findUnique.mockResolvedValue({ googleRefreshToken: encryptGoogleToken(REFRESH) })
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })))

    await disconnectGoogle("u1")

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toBe("https://oauth2.googleapis.com/revoke")
    expect(String((init as RequestInit).body)).toContain(encodeURIComponent(REFRESH))
    expect(dadosGravados()).toEqual({ googleAccessToken: null, googleRefreshToken: null, googleTokenExpiresAt: null })
  })

  it("se o Google não responder, limpa do mesmo jeito (o app esquece o acesso)", async () => {
    m.prisma.user.findUnique.mockResolvedValue({ googleRefreshToken: encryptGoogleToken(REFRESH) })
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("rede fora") }))

    await expect(disconnectGoogle("u1")).resolves.toBeUndefined()
    expect(dadosGravados()).toEqual({ googleAccessToken: null, googleRefreshToken: null, googleTokenExpiresAt: null })
  })

  it("sem token guardado, não chama o Google e limpa", async () => {
    m.prisma.user.findUnique.mockResolvedValue({ googleRefreshToken: null })
    await disconnectGoogle("u1")
    expect(fetch).not.toHaveBeenCalled()
    expect(dadosGravados()).toEqual({ googleAccessToken: null, googleRefreshToken: null, googleTokenExpiresAt: null })
  })
})
