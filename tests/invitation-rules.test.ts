import { describe, expect, it } from "vitest"
import {
  canAcceptInvitation,
  generateInviteToken,
  INVITATION_TTL_DAYS,
  INVITE_TOKEN_PATTERN,
  invitationExpiryFrom,
  isInvitationUsable,
  isInviteTokenFormat,
  sameEmail,
} from "../src/features/settings/lib/invitation-rules"

/**
 * O convite é preso a um e-mail (decisão do dono, 23/08): o link sozinho não serve
 * para ninguém. Estes testes guardam essa promessa e o uso único com prazo.
 */
const AGORA = new Date("2026-08-23T12:00:00Z")
const convite = (over: Partial<{ email: string; expiresAt: Date; acceptedAt: Date | null; revokedAt: Date | null }> = {}) => ({
  email: "convidada@example.com",
  expiresAt: invitationExpiryFrom(AGORA),
  acceptedAt: null,
  revokedAt: null,
  ...over,
})

describe("token", () => {
  it("é único, cabe na URL sem escapar e passa no formato aceito", () => {
    const a = generateInviteToken()
    const b = generateInviteToken()
    expect(a).not.toBe(b)
    expect(a).toMatch(INVITE_TOKEN_PATTERN)
    expect(encodeURIComponent(a)).toBe(a)
    expect(isInviteTokenFormat(a)).toBe(true)
  })

  it("recusa o que não tem cara de token (curto, com símbolo, não-texto)", () => {
    expect(isInviteTokenFormat("curto")).toBe(false)
    expect(isInviteTokenFormat("a".repeat(16) + "/../etc")).toBe(false)
    expect(isInviteTokenFormat(undefined)).toBe(false)
    expect(isInviteTokenFormat("a".repeat(129))).toBe(false)
  })
})

describe("prazo e uso único", () => {
  it("vale 7 dias a partir da criação", () => {
    expect(invitationExpiryFrom(AGORA).toISOString()).toBe("2026-08-30T12:00:00.000Z")
    expect(INVITATION_TTL_DAYS).toBe(7)
  })

  it("revogado > aceito > expirado > ok", () => {
    expect(isInvitationUsable(convite(), AGORA)).toBe("ok")
    expect(isInvitationUsable(convite({ expiresAt: AGORA }), AGORA)).toBe("expired")
    expect(isInvitationUsable(convite({ acceptedAt: AGORA }), AGORA)).toBe("accepted")
    expect(isInvitationUsable(convite({ acceptedAt: AGORA, revokedAt: AGORA }), AGORA)).toBe("revoked")
  })
})

describe("canAcceptInvitation — o link é de quem foi convidado", () => {
  it("aceita o e-mail convidado, sem diferenciar maiúsculas nem espaços", () => {
    expect(canAcceptInvitation(convite(), "convidada@example.com", AGORA)).toBe("ok")
    expect(canAcceptInvitation(convite(), "  Convidada@Example.COM ", AGORA)).toBe("ok")
  })

  it("link vazado não serve para outra pessoa", () => {
    expect(canAcceptInvitation(convite(), "outra@example.com", AGORA)).toBe("emailMismatch")
  })

  it("o estado do convite vem ANTES do e-mail: link morto não revela quem foi convidado", () => {
    const revogado = convite({ revokedAt: AGORA })
    expect(canAcceptInvitation(revogado, "convidada@example.com", AGORA)).toBe("revoked")
    expect(canAcceptInvitation(revogado, "outra@example.com", AGORA)).toBe("revoked")

    const expirado = convite({ expiresAt: AGORA })
    expect(canAcceptInvitation(expirado, "convidada@example.com", AGORA)).toBe("expired")
    expect(canAcceptInvitation(expirado, "outra@example.com", AGORA)).toBe("expired")
  })

  it("convite sem e-mail não vale para ninguém (não existe convite aberto)", () => {
    expect(canAcceptInvitation(convite({ email: "" }), "qualquer@example.com", AGORA)).toBe("emailMismatch")
    expect(sameEmail("", "")).toBe(false)
  })
})
