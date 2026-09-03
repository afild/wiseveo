import { describe, expect, it } from "vitest"
import { buildSecurityContext, type SecurityStateView } from "@/features/security/lib/security-context"
import type { Actor } from "@/features/security/lib/permissions"

const owner: Actor = { actorUserId: "u1", ownerId: "u1", role: "USER", status: "ACTIVE", showcase: false }
const invitedAdmin: Actor = { ...owner, actorUserId: "u2", ownerId: "u1", role: "ADMIN" }
const invitedUser: Actor = { ...owner, actorUserId: "u3", ownerId: "u1", role: "USER" }
const showcase: Actor = { ...owner, showcase: true }

const state: SecurityStateView = {
  closedThrough: "2026-08-31",
  hasPin: true,
  canManageClosing: true,
  canManagePin: true,
  showcase: false,
  pinUpdatedAt: "2026-08-30T12:00:00.000Z",
}

describe("contexto da aba Segurança", () => {
  it("dono dos dados edita tudo, inclusive o PIN", () => {
    expect(buildSecurityContext(owner, state)).toEqual({
      readOnly: false,
      showcase: false,
      canManagePin: true,
      state,
    })
  })

  it("ADMIN convidado fecha e reabre, mas não vê o cartão do PIN", () => {
    const context = buildSecurityContext(invitedAdmin, state)
    expect(context.readOnly).toBe(false)
    expect(context.canManagePin).toBe(false)
  })

  it("USER convidado só lê o estado", () => {
    const context = buildSecurityContext(invitedUser, state)
    expect(context.readOnly).toBe(true)
    expect(context.canManagePin).toBe(false)
  })

  it("sessão de vitrine só lê o estado e recebe a marca da demonstração", () => {
    const context = buildSecurityContext(showcase, state)
    expect(context.readOnly).toBe(true)
    expect(context.canManagePin).toBe(false)
    expect(context.showcase).toBe(true)
  })

  it("a marca da demonstração é só da vitrine, nunca da cópia do visitante", () => {
    expect(buildSecurityContext(owner, state).showcase).toBe(false)
    expect(buildSecurityContext(invitedAdmin, state).showcase).toBe(false)
    expect(buildSecurityContext(invitedUser, state).showcase).toBe(false)
  })

  it("o estado do servidor atravessa intacto, com a data do PIN que a rota de estado não devolve", () => {
    expect(buildSecurityContext(owner, state).state).toBe(state)
    expect(buildSecurityContext(owner, state).state.pinUpdatedAt).toBe("2026-08-30T12:00:00.000Z")
  })

  it("usuário ainda não aprovado só lê o estado", () => {
    const pending = buildSecurityContext({ ...owner, status: "PENDING" }, state)
    expect(pending.readOnly).toBe(true)
    expect(pending.canManagePin).toBe(false)
  })
})
