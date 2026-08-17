import crypto from "crypto"

/** Regras puras dos convites (sem banco): token, validade, usabilidade. */

export const INVITATION_TTL_DAYS = 7

export type InvitationUsability = "ok" | "expired" | "accepted" | "revoked"

export function generateInviteToken(): string {
  return crypto.randomBytes(32).toString("base64url")
}

/** Formato aceito na URL /convite/<token> e no cookie do fluxo Google. */
export const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/

export function isInvitationUsable(
  invitation: { expiresAt: Date; acceptedAt: Date | null; revokedAt: Date | null },
  now: Date = new Date(),
): InvitationUsability {
  if (invitation.revokedAt) return "revoked"
  if (invitation.acceptedAt) return "accepted"
  if (invitation.expiresAt.getTime() <= now.getTime()) return "expired"
  return "ok"
}

export function invitationExpiryFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000)
}
