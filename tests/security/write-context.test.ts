import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * O contexto que toda rota de ESCRITA monta: quem age, de quem são os dados e se há autorização de
 * PIN válida. O token só vale quando é do MESMO dono E da MESMA pessoa da sessão — um token
 * emprestado (outro dono, ou outra pessoa da mesma conta) tem de sair como se não existisse.
 */
const m = vi.hoisted(() => ({
  session: null as { userId: string; demoShared?: boolean } | null,
  user: null as { role: string; status: string } | null,
  ownerId: "dono",
  token: null as { ownerId: string; userId: string } | null,
  verified: [] as string[],
}))

vi.mock("@/lib/session", () => ({ getSession: async () => m.session }))
vi.mock("@/lib/data-owner", () => ({ resolveDataOwnerId: async () => m.ownerId }))
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: async () => m.user } } }))
vi.mock("@/features/security/services/pin.service", () => ({
  verifyOverrideToken: async (raw: string) => { m.verified.push(raw); return m.token },
}))

import { PIN_TOKEN_HEADER } from "@/features/security/lib/http"
import { getWriteActor, getWriteContext } from "@/features/security/services/write-context"

const request = (token?: string) =>
  new Request("https://app.wiseveo.com/api/transactions", { headers: token ? { [PIN_TOKEN_HEADER]: token } : {} })

beforeEach(() => {
  m.session = { userId: "dono" }
  m.user = { role: "SUPERADMIN", status: "ACTIVE" }
  m.ownerId = "dono"
  m.token = { ownerId: "dono", userId: "dono" }
  m.verified = []
})

describe("getWriteContext", () => {
  it("sem sessão devolve null (a rota responde 401)", async () => {
    m.session = null
    expect(await getWriteContext(request("t"))).toBeNull()
    expect(m.verified).toEqual([])
  })
  it("sessão de usuário que sumiu do banco devolve null", async () => {
    m.user = null
    expect(await getWriteContext(request())).toBeNull()
  })
  it("monta ator com dono resolvido e sem token quando o cabeçalho não vem", async () => {
    expect(await getWriteContext(request())).toEqual({
      actorUserId: "dono", ownerId: "dono", role: "SUPERADMIN", status: "ACTIVE", showcase: false, override: null,
    })
  })
  it("token válido do mesmo dono e da mesma pessoa entra como override", async () => {
    expect(await getWriteContext(request("bom"))).toMatchObject({ override: { ownerId: "dono", userId: "dono" } })
    expect(m.verified).toEqual(["bom"])
  })
  it("token de OUTRO dono é descartado", async () => {
    m.token = { ownerId: "outro-dono", userId: "dono" }
    expect(await getWriteContext(request("emprestado"))).toMatchObject({ override: null })
  })
  /** Mesma conta, pessoa diferente: o token de quem digitou o PIN não pode liberar o vizinho. */
  it("token de OUTRA pessoa do mesmo dono também é descartado", async () => {
    m.session = { userId: "convidado" }
    m.token = { ownerId: "dono", userId: "dono" }
    expect(await getWriteContext(request("do-dono"))).toMatchObject({ actorUserId: "convidado", override: null })
  })
  it("token que não verifica sai como null", async () => {
    m.token = null
    expect(await getWriteContext(request("estragado"))).toMatchObject({ override: null })
  })
  it("allowOverride: false ignora o cabeçalho (nem chega a verificar)", async () => {
    expect(await getWriteContext(request("bom"), { allowOverride: false })).toMatchObject({ override: null })
    expect(m.verified).toEqual([])
  })
  it("sessão de vitrine sai marcada como showcase", async () => {
    m.session = { userId: "visitante", demoShared: true }
    expect(await getWriteContext(request())).toMatchObject({ actorUserId: "visitante", showcase: true })
  })
})

/** A contraparte para server actions (orçamento): o MESMO ator, sem cabeçalho e sem token. */
describe("getWriteActor", () => {
  it("sem sessão devolve null (a action falha do jeito documentado)", async () => {
    m.session = null
    expect(await getWriteActor()).toBeNull()
  })
  it("sessão de usuário que sumiu do banco devolve null", async () => {
    m.user = null
    expect(await getWriteActor()).toBeNull()
  })
  it("monta o mesmo ator de getWriteContext, sem override e sem verificar token nenhum", async () => {
    m.session = { userId: "convidado" }
    const actor = await getWriteActor()
    expect(actor).toEqual({ actorUserId: "convidado", ownerId: "dono", role: "SUPERADMIN", status: "ACTIVE", showcase: false })
    expect(actor).not.toHaveProperty("override")
    expect(m.verified).toEqual([])
  })
  it("sessão de vitrine sai marcada como showcase", async () => {
    m.session = { userId: "visitante", demoShared: true }
    expect(await getWriteActor()).toMatchObject({ showcase: true })
  })
})
