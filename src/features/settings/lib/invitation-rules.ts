import crypto from "crypto"
import { normalizeEmail } from "@/lib/user-approval"

/**
 * Regras puras do convite (sem banco): token, prazo, uso único e a quem ele serve.
 *
 * Decisão do dono (23/08): o convite é PRESO A UM E-MAIL. O link sozinho não vale
 * nada — se vazar, só entra quem tiver aquele e-mail, por Google ou por senha. É o
 * que torna "prático" e "seguro" a mesma coisa: um link, um clique, ninguém mais.
 */

export const INVITATION_TTL_DAYS = 7

/** Por que o convite não pode ser usado (ou "ok"). */
export type InvitationUsability = "ok" | "expired" | "accepted" | "revoked"

/** Idem, mais a recusa por e-mail diferente do convidado. */
export type InvitationAcceptance = InvitationUsability | "emailMismatch"

export function generateInviteToken(): string {
  return crypto.randomBytes(32).toString("base64url")
}

/** Formato aceito na URL /convite/<token> e no cookie do fluxo Google. */
export const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/

export function isInviteTokenFormat(value: unknown): value is string {
  return typeof value === "string" && INVITE_TOKEN_PATTERN.test(value)
}

/** O convite ainda está de pé? (não olha quem está tentando usar) */
export function isInvitationUsable(
  invitation: { expiresAt: Date; acceptedAt: Date | null; revokedAt: Date | null },
  now: Date = new Date(),
): InvitationUsability {
  if (invitation.revokedAt) return "revoked"
  if (invitation.acceptedAt) return "accepted"
  if (invitation.expiresAt.getTime() <= now.getTime()) return "expired"
  return "ok"
}

/**
 * Esta pessoa pode aceitar este convite? Ordem proposital: o estado do convite vem
 * antes do e-mail, para um link revogado não virar sonda de "existe convite para
 * fulano?" — a resposta é a mesma para qualquer e-mail.
 */
export function canAcceptInvitation(
  invitation: { email: string; expiresAt: Date; acceptedAt: Date | null; revokedAt: Date | null },
  email: string,
  now: Date = new Date(),
): InvitationAcceptance {
  const usability = isInvitationUsable(invitation, now)
  if (usability !== "ok") return usability
  return sameEmail(invitation.email, email) ? "ok" : "emailMismatch"
}

/** Comparação de e-mail como o resto do sistema faz (sem diferenciar maiúsculas). */
export function sameEmail(a: string, b: string): boolean {
  return Boolean(a) && normalizeEmail(a) === normalizeEmail(b)
}

export function invitationExpiryFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000)
}
