import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Motor do convite. Tudo dublado (Prisma, dono dos dados, i18n): o que se testa são as
 * REGRAS — convite preso ao e-mail, uso único, quem pode convidar quem, e o cuidado de
 * não revelar nada a quem só tem o link.
 */
const m = vi.hoisted(() => ({
  actor: { id: "dono", role: "SUPERADMIN", status: "ACTIVE" } as {
    id: string
    role: string
    status: string
  } | null,
  userByEmail: null as { id: string } | null,
  invitation: null as Record<string, unknown> | null,
  created: { id: "novo", preferencesJson: null },
  createInvitation: vi.fn(async (args: { data: { email: string; role: string } }) => ({
    id: "inv-1",
    token: "t".repeat(32),
    email: args.data.email,
    role: args.data.role,
    createdAt: new Date("2026-08-23T12:00:00Z"),
    expiresAt: new Date("2026-08-30T12:00:00Z"),
    invitedBy: { name: "Dono" },
  })),
  updateInvitation: vi.fn(async (_args: { where: unknown; data: Record<string, unknown> }) => ({})),
  createUser: vi.fn(async (_args: { data: Record<string, unknown> }) => m.created),
  updateUser: vi.fn(async (_args: unknown) => ({})),
  setDataOwner: vi.fn(async (_userId: string, _ownerId: string) => {}),
  ownerOf: vi.fn(async (id: string) => (id === "convidada" ? "dono" : id)),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async (args: { where: { id?: string; email?: string } }) =>
        args.where.email !== undefined ? m.userByEmail : m.actor,
      ),
      create: (args: { data: Record<string, unknown> }) => m.createUser(args),
      update: (args: unknown) => m.updateUser(args),
    },
    invitation: {
      create: (args: { data: { email: string; role: string } }) => m.createInvitation(args),
      findUnique: vi.fn(async () => m.invitation),
      findMany: vi.fn(async () => []),
      update: (args: { where: unknown; data: Record<string, unknown> }) => m.updateInvitation(args),
    },
  },
}))
vi.mock("@/lib/data-owner", () => ({
  resolveDataOwnerId: (id: string) => m.ownerOf(id),
  listAccountMemberIds: async (id: string) => [id],
  setDataOwner: (userId: string, ownerId: string) => m.setDataOwner(userId, ownerId),
}))
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}))
vi.mock("bcryptjs", () => ({ default: { hash: async () => "hash" } }))

import {
  acceptInvitationWithPassword,
  createInvitation,
  getInvitationPublicInfo,
  maskEmail,
  peekInvitation,
  revokeInvitation,
} from "@/features/settings/services/invitations-service"

const TOKEN = "t".repeat(32)
const conviteValido = (over: Record<string, unknown> = {}) => ({
  id: "inv-1",
  email: "convidada@example.com",
  role: "USER",
  expiresAt: new Date(Date.now() + 86_400_000),
  acceptedAt: null,
  revokedAt: null,
  invitedById: "dono",
  invitedBy: { name: "Dono" },
  ...over,
})

beforeEach(() => {
  m.actor = { id: "dono", role: "SUPERADMIN", status: "ACTIVE" }
  m.userByEmail = null
  m.invitation = null
  m.createInvitation.mockClear()
  m.updateInvitation.mockClear()
  m.createUser.mockClear()
  m.updateUser.mockClear()
  m.setDataOwner.mockClear()
})

describe("createInvitation", () => {
  it("nasce preso ao e-mail, normalizado, com prazo e token", async () => {
    const invite = await createInvitation({ invitedById: "dono", email: "  Convidada@Example.COM " })
    expect(invite.email).toBe("convidada@example.com")
    expect(invite.token).toHaveLength(32)
    expect(m.createInvitation).toHaveBeenCalledTimes(1)
  })

  it("recusa sem e-mail — não existe convite aberto", async () => {
    await expect(createInvitation({ invitedById: "dono", email: "" })).rejects.toMatchObject({ code: "emailRequired" })
    await expect(createInvitation({ invitedById: "dono", email: "semarroba" })).rejects.toMatchObject({
      code: "emailRequired",
    })
    expect(m.createInvitation).not.toHaveBeenCalled()
  })

  it("recusa e-mail que já tem conta aqui", async () => {
    m.userByEmail = { id: "existente" }
    await expect(createInvitation({ invitedById: "dono", email: "ja@example.com" })).rejects.toMatchObject({
      code: "emailTaken",
    })
    expect(m.createInvitation).not.toHaveBeenCalled()
  })

  it("ADMIN não convida outro ADMIN; só o dono pode", async () => {
    m.actor = { id: "adm", role: "ADMIN", status: "ACTIVE" }
    await expect(
      createInvitation({ invitedById: "adm", email: "nova@example.com", role: "ADMIN" }),
    ).rejects.toMatchObject({ code: "forbiddenRole" })
  })

  it("quem não administra não convida ninguém", async () => {
    m.actor = { id: "comum", role: "USER", status: "ACTIVE" }
    await expect(createInvitation({ invitedById: "comum", email: "nova@example.com" })).rejects.toMatchObject({
      status: 403,
    })
  })
})

describe("getInvitationPublicInfo — o link mostra o mínimo", () => {
  it("convite de pé: quem convidou e só uma pista do e-mail", async () => {
    m.invitation = conviteValido()
    const info = await getInvitationPublicInfo(TOKEN)
    expect(info).toMatchObject({ status: "ok", inviterName: "Dono" })
    expect(info).not.toHaveProperty("email")
    if (info.status === "ok") {
      expect(info.maskedEmail).toBe("c••••••@example.com")
      expect(info.maskedEmail).not.toContain("convidada")
    }
  })

  it("token fora de formato nem chega ao banco", async () => {
    expect(await getInvitationPublicInfo("curto")).toEqual({ status: "invalid" })
  })

  it("cancelado e vencido aparecem como tais, sem revelar o e-mail", async () => {
    m.invitation = conviteValido({ revokedAt: new Date() })
    expect(await getInvitationPublicInfo(TOKEN)).toEqual({ status: "revoked" })
    m.invitation = conviteValido({ expiresAt: new Date(Date.now() - 1000) })
    expect(await getInvitationPublicInfo(TOKEN)).toEqual({ status: "expired" })
  })
})

describe("aceite com senha", () => {
  it("e-mail diferente do convidado é recusado — link vazado não serve", async () => {
    m.invitation = conviteValido()
    await expect(
      acceptInvitationWithPassword({ token: TOKEN, name: "Outra", email: "outra@example.com", password: "12345678" }),
    ).rejects.toMatchObject({ code: "emailMismatch" })
    expect(m.createUser).not.toHaveBeenCalled()
  })

  it("e-mail certo: cria a pessoa ATIVA, aponta para o dono e queima o convite", async () => {
    m.invitation = conviteValido()
    const result = await acceptInvitationWithPassword({
      token: TOKEN,
      name: "Convidada",
      email: "Convidada@Example.com",
      password: "12345678",
    })
    expect(result.userId).toBe("novo")
    expect(m.createUser.mock.calls[0]?.[0]).toMatchObject({ data: { status: "ACTIVE", role: "USER" } })
    expect(m.setDataOwner).toHaveBeenCalledWith("novo", "dono")
    expect(m.updateInvitation.mock.calls[0]?.[0]?.data.acceptedByUserId).toBe("novo")
  })

  it("convite já usado não cria ninguém", async () => {
    m.invitation = conviteValido({ acceptedAt: new Date() })
    await expect(
      acceptInvitationWithPassword({ token: TOKEN, name: "X", email: "convidada@example.com", password: "12345678" }),
    ).rejects.toMatchObject({ code: "accepted" })
    expect(m.createUser).not.toHaveBeenCalled()
  })
})

describe("peekInvitation (fluxo Google)", () => {
  it("devolve o papel e o dono quando o e-mail confere", async () => {
    m.invitation = conviteValido()
    expect(await peekInvitation(TOKEN, "convidada@example.com")).toEqual({ role: "USER", ownerId: "dono" })
  })

  it("devolve null para outro e-mail — sem distinguir de convite inexistente", async () => {
    m.invitation = conviteValido()
    expect(await peekInvitation(TOKEN, "outra@example.com")).toBeNull()
    m.invitation = null
    expect(await peekInvitation(TOKEN, "convidada@example.com")).toBeNull()
  })
})

describe("revokeInvitation", () => {
  it("convite de outra conta responde como inexistente", async () => {
    m.invitation = conviteValido({ invitedById: "convidada" })
    m.ownerOf.mockImplementation(async (id: string) => (id === "convidada" ? "outro-dono" : id))
    await expect(revokeInvitation("dono", "inv-1")).rejects.toMatchObject({ code: "invalid", status: 404 })
    expect(m.updateInvitation).not.toHaveBeenCalled()
    m.ownerOf.mockImplementation(async (id: string) => (id === "convidada" ? "dono" : id))
  })

  it("revogar duas vezes não muda o que já estava revogado", async () => {
    m.invitation = conviteValido({ revokedAt: new Date() })
    await revokeInvitation("dono", "inv-1")
    expect(m.updateInvitation).not.toHaveBeenCalled()
  })
})

describe("maskEmail", () => {
  it("mostra a primeira letra e o domínio, nunca o resto", () => {
    expect(maskEmail("convidada@example.com")).toBe("c••••••@example.com")
    // Pontos em número fixo: nem o tamanho do e-mail vaza.
    expect(maskEmail("ab@x.com")).toBe("a••••••@x.com")
  })
})
