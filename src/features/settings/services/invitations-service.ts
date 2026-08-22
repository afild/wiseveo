import bcrypt from "bcryptjs"
import { getTranslations } from "next-intl/server"
import { prisma } from "@/lib/prisma"
import { resolveDataOwnerId } from "@/lib/data-owner"
import { normalizeEmail } from "@/lib/user-approval"
import { invitableRoles, isUserRole, type UserRole } from "@/lib/user-roles"
import { AdminAccessError } from "./admin-users-service"
import {
  generateInviteToken,
  invitationExpiryFrom,
  isInvitationUsable,
  type InvitationUsability,
} from "../lib/invitation-rules"

export { INVITATION_TTL_DAYS, generateInviteToken, invitationExpiryFrom, isInvitationUsable } from "../lib/invitation-rules"

/**
 * Convites para a conta compartilhada. Link público: /convite/<token>.
 * Quem aceita vira membro da conta do DONO de quem convidou (data_owner_id),
 * já ATIVO (sem aprovação) e sem plano de contas próprio — usa o do dono.
 */

export interface InvitationSummary {
  id: string
  email: string | null
  role: UserRole
  invitedByName: string
  createdAt: string
  expiresAt: string
}

export class InvitationError extends Error {
  constructor(
    public readonly code: "invalid" | "expired" | "accepted" | "revoked" | "emailTaken" | "forbiddenRole",
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "InvitationError"
  }
}

async function requireInviter(actorId: string) {
  const t = await getTranslations("settings.adminUsers.errors")
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { id: true, role: true, status: true },
  })
  if (!actor || actor.status !== "ACTIVE" || invitableRoles(actor.role).length === 0) {
    throw new AdminAccessError(403, t("adminOnly"))
  }
  return actor
}

export async function createInvitation(input: {
  invitedById: string
  email?: string | null
  role?: UserRole
}): Promise<InvitationSummary & { token: string }> {
  const actor = await requireInviter(input.invitedById)
  const role: UserRole = input.role && isUserRole(input.role) ? input.role : "USER"
  if (!invitableRoles(actor.role).includes(role)) {
    const t = await getTranslations("api.invitations")
    throw new InvitationError("forbiddenRole", 403, t("forbiddenRole"))
  }
  const email = input.email ? normalizeEmail(input.email) : null

  const invitation = await prisma.invitation.create({
    data: {
      token: generateInviteToken(),
      invitedById: input.invitedById,
      email: email || null,
      role,
      expiresAt: invitationExpiryFrom(),
    },
    include: { invitedBy: { select: { name: true } } },
  })

  return {
    id: invitation.id,
    token: invitation.token,
    email: invitation.email,
    role: invitation.role,
    invitedByName: invitation.invitedBy.name,
    createdAt: invitation.createdAt.toISOString(),
    expiresAt: invitation.expiresAt.toISOString(),
  }
}

/** Convites ainda válidos da conta (do dono e de todos os membros que convidam). */
export async function listPendingInvitations(actorId: string): Promise<InvitationSummary[]> {
  const ownerId = await resolveDataOwnerId(actorId)
  const memberIds = (
    await prisma.user.findMany({ where: { OR: [{ id: ownerId }, { dataOwnerId: ownerId }] }, select: { id: true } })
  ).map((u) => u.id)

  const rows = await prisma.invitation.findMany({
    where: { invitedById: { in: memberIds }, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    include: { invitedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  })
  return rows.map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role,
    invitedByName: i.invitedBy.name,
    createdAt: i.createdAt.toISOString(),
    expiresAt: i.expiresAt.toISOString(),
  }))
}

export async function revokeInvitation(actorId: string, invitationId: string): Promise<void> {
  await requireInviter(actorId)
  const ownerId = await resolveDataOwnerId(actorId)
  const invitation = await prisma.invitation.findUnique({
    where: { id: invitationId },
    include: { invitedBy: { select: { id: true, dataOwnerId: true } } },
  })
  const t = await getTranslations("api.invitations")
  if (!invitation) throw new InvitationError("invalid", 404, t("notFound"))
  const invitationOwner = invitation.invitedBy.dataOwnerId ?? invitation.invitedBy.id
  if (invitationOwner !== ownerId) throw new InvitationError("invalid", 404, t("notFound"))
  if (!invitation.revokedAt) {
    await prisma.invitation.update({ where: { id: invitationId }, data: { revokedAt: new Date() } })
  }
}

/** Dados públicos do convite para a página /convite/<token> (nada sensível). */
export async function getInvitationPublicInfo(token: string): Promise<
  | { status: "ok"; inviterName: string; email: string | null; role: UserRole }
  | { status: Exclude<InvitationUsability, "ok"> | "invalid" }
> {
  if (!token || token.length > 128) return { status: "invalid" }
  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: { invitedBy: { select: { name: true } } },
  })
  if (!invitation) return { status: "invalid" }
  const usability = isInvitationUsable(invitation)
  if (usability !== "ok") return { status: usability }
  return { status: "ok", inviterName: invitation.invitedBy.name, email: invitation.email, role: invitation.role }
}

async function loadUsableInvitation(token: string) {
  const t = await getTranslations("api.invitations")
  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: { invitedBy: { select: { id: true, dataOwnerId: true } } },
  })
  if (!invitation) throw new InvitationError("invalid", 404, t("invalid"))
  const usability = isInvitationUsable(invitation)
  if (usability === "expired") throw new InvitationError("expired", 410, t("expired"))
  if (usability === "accepted") throw new InvitationError("accepted", 410, t("alreadyAccepted"))
  if (usability === "revoked") throw new InvitationError("revoked", 410, t("revoked"))
  return invitation
}

/** Aceite com nome + senha: cria o membro (ATIVO, sem plano de contas próprio) e devolve o id. */
export async function acceptInvitationWithPassword(input: {
  token: string
  name: string
  email: string
  password: string
}): Promise<{ userId: string; preferencesJson: unknown }> {
  const t = await getTranslations("api.invitations")
  const invitation = await loadUsableInvitation(input.token)
  const email = normalizeEmail(input.email)
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (existing) throw new InvitationError("emailTaken", 409, t("emailTaken"))

  const dataOwnerId = invitation.invitedBy.dataOwnerId ?? invitation.invitedBy.id
  const passwordHash = await bcrypt.hash(input.password, 10)

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: input.name.trim(),
        email,
        passwordHash,
        role: invitation.role,
        status: "ACTIVE",
        dataOwnerId,
      },
      select: { id: true, preferencesJson: true },
    })
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date(), acceptedByUserId: created.id },
    })
    return created
  })
  return { userId: user.id, preferencesJson: user.preferencesJson }
}

/** Aceite via Google (usuário recém-criado no callback): vincula ao dono e marca aceito. */
export async function acceptInvitationForUser(input: { token: string; userId: string }): Promise<void> {
  const invitation = await loadUsableInvitation(input.token)
  const dataOwnerId = invitation.invitedBy.dataOwnerId ?? invitation.invitedBy.id
  await prisma.$transaction([
    prisma.user.update({
      where: { id: input.userId },
      data: { dataOwnerId, role: invitation.role, status: "ACTIVE" },
    }),
    prisma.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date(), acceptedByUserId: input.userId },
    }),
  ])
}

/** Para o callback do Google: o convite existe e ainda pode ser usado? */
export async function peekInvitation(token: string): Promise<{ role: UserRole; dataOwnerId: string } | null> {
  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: { invitedBy: { select: { id: true, dataOwnerId: true } } },
  })
  if (!invitation || isInvitationUsable(invitation) !== "ok") return null
  return { role: invitation.role, dataOwnerId: invitation.invitedBy.dataOwnerId ?? invitation.invitedBy.id }
}
