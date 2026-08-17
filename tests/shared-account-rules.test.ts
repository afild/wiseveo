import { describe, expect, it } from "vitest"
import { canChangeRole, canRemoveUser, invitableRoles, isUserRole } from "../src/lib/user-roles"
import {
  generateInviteToken,
  INVITE_TOKEN_PATTERN,
  invitationExpiryFrom,
  isInvitationUsable,
} from "../src/features/settings/lib/invitation-rules"

/**
 * Conta compartilhada: membro convidado = "tudo, menos administrar"; o dono
 * (SUPERADMIN) promove/rebaixa/remove; só SUPERADMIN iguala o dono; ninguém
 * mexe em si mesmo; o dono dos dados nunca é rebaixado/removido por outros.
 */
describe("canChangeRole", () => {
  const base = { isSelf: false, targetIsDataOwner: false } as const

  it("SUPERADMIN promove e rebaixa qualquer um, inclusive para/de SUPERADMIN", () => {
    expect(canChangeRole({ ...base, actorRole: "SUPERADMIN", targetRole: "USER", newRole: "ADMIN" })).toBe("ok")
    expect(canChangeRole({ ...base, actorRole: "SUPERADMIN", targetRole: "USER", newRole: "SUPERADMIN" })).toBe("ok")
    expect(canChangeRole({ ...base, actorRole: "SUPERADMIN", targetRole: "SUPERADMIN", newRole: "USER" })).toBe("ok")
  })

  it("ADMIN não altera papéis (só SUPERADMIN tem esse poder)", () => {
    expect(canChangeRole({ ...base, actorRole: "ADMIN", targetRole: "USER", newRole: "ADMIN" })).toBe("aboveActor")
    expect(canChangeRole({ ...base, actorRole: "ADMIN", targetRole: "ADMIN", newRole: "USER" })).toBe("aboveActor")
    expect(canChangeRole({ ...base, actorRole: "ADMIN", targetRole: "SUPERADMIN", newRole: "USER" })).toBe("aboveActor")
  })

  it("USER não administra; ninguém altera a si mesmo; dono dos dados é intocável; mesmo papel é no-op", () => {
    expect(canChangeRole({ ...base, actorRole: "USER", targetRole: "USER", newRole: "ADMIN" })).toBe("notAdmin")
    expect(canChangeRole({ actorRole: "SUPERADMIN", targetRole: "SUPERADMIN", newRole: "USER", isSelf: true, targetIsDataOwner: false })).toBe("self")
    expect(canChangeRole({ actorRole: "SUPERADMIN", targetRole: "SUPERADMIN", newRole: "USER", isSelf: false, targetIsDataOwner: true })).toBe("dataOwner")
    expect(canChangeRole({ ...base, actorRole: "SUPERADMIN", targetRole: "ADMIN", newRole: "ADMIN" })).toBe("sameRole")
  })
})

describe("canRemoveUser", () => {
  it("SUPERADMIN remove qualquer um exceto si mesmo e o dono; ADMIN só remove USER", () => {
    expect(canRemoveUser({ actorRole: "SUPERADMIN", targetRole: "ADMIN", isSelf: false, targetIsDataOwner: false })).toBe("ok")
    expect(canRemoveUser({ actorRole: "SUPERADMIN", targetRole: "SUPERADMIN", isSelf: false, targetIsDataOwner: false })).toBe("ok")
    expect(canRemoveUser({ actorRole: "SUPERADMIN", targetRole: "USER", isSelf: true, targetIsDataOwner: false })).toBe("self")
    expect(canRemoveUser({ actorRole: "SUPERADMIN", targetRole: "SUPERADMIN", isSelf: false, targetIsDataOwner: true })).toBe("dataOwner")
    expect(canRemoveUser({ actorRole: "ADMIN", targetRole: "USER", isSelf: false, targetIsDataOwner: false })).toBe("ok")
    expect(canRemoveUser({ actorRole: "ADMIN", targetRole: "ADMIN", isSelf: false, targetIsDataOwner: false })).toBe("aboveActor")
    expect(canRemoveUser({ actorRole: "USER", targetRole: "USER", isSelf: false, targetIsDataOwner: false })).toBe("notAdmin")
  })
})

describe("invitableRoles / isUserRole", () => {
  it("SUPERADMIN convida USER ou ADMIN; ADMIN só USER; USER ninguém", () => {
    expect(invitableRoles("SUPERADMIN")).toEqual(["USER", "ADMIN"])
    expect(invitableRoles("ADMIN")).toEqual(["USER"])
    expect(invitableRoles("USER")).toEqual([])
    expect(isUserRole("ADMIN")).toBe(true)
    expect(isUserRole("ROOT")).toBe(false)
  })
})

describe("convites — regras puras", () => {
  it("token único, URL-safe e no formato aceito pela página/cookie", () => {
    const a = generateInviteToken()
    const b = generateInviteToken()
    expect(a).not.toBe(b)
    expect(a).toMatch(INVITE_TOKEN_PATTERN)
    expect(encodeURIComponent(a)).toBe(a)
  })

  it("validade de 7 dias e usabilidade: revogado > aceito > expirado > ok", () => {
    const now = new Date("2026-08-16T12:00:00Z")
    const expiresAt = invitationExpiryFrom(now)
    expect(expiresAt.toISOString()).toBe("2026-08-23T12:00:00.000Z")
    expect(isInvitationUsable({ expiresAt, acceptedAt: null, revokedAt: null }, now)).toBe("ok")
    expect(isInvitationUsable({ expiresAt: now, acceptedAt: null, revokedAt: null }, now)).toBe("expired")
    expect(isInvitationUsable({ expiresAt, acceptedAt: now, revokedAt: null }, now)).toBe("accepted")
    expect(isInvitationUsable({ expiresAt, acceptedAt: now, revokedAt: now }, now)).toBe("revoked")
  })
})
