import bcrypt from "bcryptjs"
import { getTranslations } from "next-intl/server"
import { prisma } from "@/lib/prisma"
import { listAccountMemberIds, resolveDataOwnerId, setDataOwner } from "@/lib/data-owner"
import { normalizeEmail } from "@/lib/user-approval"
import { invitableRoles, isUserRole, type UserRole } from "@/lib/user-roles"
import { AdminAccessError } from "./admin-users-service"
import { readSharedAccountStructure } from "./shared-account-service"
import {
  canAcceptInvitation,
  generateInviteToken,
  invitationExpiryFrom,
  isInviteTokenFormat,
  sameEmail,
} from "../lib/invitation-rules"

export {
  INVITATION_TTL_DAYS,
  canAcceptInvitation,
  generateInviteToken,
  invitationExpiryFrom,
  isInvitationUsable,
} from "../lib/invitation-rules"

/**
 * Convites da conta compartilhada. Link público: /convite/<token>.
 *
 * Regras que valem em todo lugar (decisão do dono, 23/08): o convite é PRESO A UM
 * E-MAIL — link vazado não serve para outra pessoa —, é de uso único, dura 7 dias e
 * pode ser revogado. Quem aceita passa a lançar na conta de quem convidou
 * (`users.data_owner_id`) já ATIVO, sem plano de contas próprio: usa o do dono.
 *
 * Depende da estrutura criada em Configurações → Usuários ("Preparar meu banco").
 * Sem ela, `prisma.invitation` não existe no banco e as funções falham — por isso a
 * tela só oferece convites quando a estrutura está pronta.
 */

export interface InvitationSummary {
  id: string
  email: string | null
  role: UserRole
  invitedByName: string
  createdAt: string
  expiresAt: string
}

export type InvitationErrorCode =
  | "invalid"
  | "expired"
  | "accepted"
  | "revoked"
  | "emailMismatch"
  | "emailTaken"
  | "emailRequired"
  | "forbiddenRole"
  | "notPrepared"

export class InvitationError extends Error {
  constructor(
    public readonly code: InvitationErrorCode,
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "InvitationError"
  }
}

/**
 * Sem a coluna de dono e a tabela de convites, um convite nasceria impossível de
 * aceitar. Barrar aqui — e não só na tela — mantém a promessa de que ninguém fica
 * pela metade numa instalação que ainda não foi preparada.
 */
async function requirePreparedDatabase() {
  const structure = await readSharedAccountStructure()
  if (!structure.ready) {
    const t = await getTranslations("api.invitations")
    throw new InvitationError("notPrepared", 409, t("notPrepared"))
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

/**
 * Mostra o e-mail sem entregá-lo a quem só tem o link: primeira letra + domínio.
 * A quantidade de pontos é FIXA de propósito — o tamanho do e-mail também é pista.
 */
const MASK = "•".repeat(6)

export function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@")
  return `${user.slice(0, 1)}${MASK}@${domain}`
}

export async function createInvitation(input: {
  invitedById: string
  email: string
  role?: UserRole
}): Promise<InvitationSummary & { token: string }> {
  const t = await getTranslations("api.invitations")
  const actor = await requireInviter(input.invitedById)
  await requirePreparedDatabase()

  const email = normalizeEmail(String(input.email ?? ""))
  if (!email || !email.includes("@")) throw new InvitationError("emailRequired", 400, t("emailRequired"))

  const role: UserRole = input.role && isUserRole(input.role) ? input.role : "USER"
  if (!invitableRoles(actor.role).includes(role)) {
    throw new InvitationError("forbiddenRole", 403, t("forbiddenRole"))
  }

  // Quem já tem conta aqui não precisa de convite — e um convite para um e-mail que já
  // existe só serviria para confundir na hora do aceite.
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (existing) throw new InvitationError("emailTaken", 409, t("emailTaken"))

  const invitation = await prisma.invitation.create({
    data: {
      token: generateInviteToken(),
      invitedById: input.invitedById,
      email,
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

/** Convites ainda de pé da conta (do dono e de quem mais convida nela). */
export async function listPendingInvitations(actorId: string): Promise<InvitationSummary[]> {
  const ownerId = await resolveDataOwnerId(actorId)
  const memberIds = await listAccountMemberIds(ownerId)

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
  const t = await getTranslations("api.invitations")
  const ownerId = await resolveDataOwnerId(actorId)

  const invitation = await prisma.invitation.findUnique({
    where: { id: invitationId },
    select: { id: true, invitedById: true, revokedAt: true },
  })
  if (!invitation) throw new InvitationError("invalid", 404, t("notFound"))

  // Convite de OUTRA conta responde igual a convite inexistente: nada a revelar.
  const invitationOwner = await resolveDataOwnerId(invitation.invitedById)
  if (invitationOwner !== ownerId) throw new InvitationError("invalid", 404, t("notFound"))

  if (!invitation.revokedAt) {
    await prisma.invitation.update({ where: { id: invitationId }, data: { revokedAt: new Date() } })
  }
}

/**
 * O que a página /convite/<token> pode mostrar a quem tem o link: quem convidou e uma
 * pista do e-mail — nunca o e-mail inteiro, nunca o papel de outras pessoas.
 */
export async function getInvitationPublicInfo(token: string): Promise<
  { status: "ok"; inviterName: string; maskedEmail: string } | { status: "invalid" | "expired" | "accepted" | "revoked" }
> {
  if (!isInviteTokenFormat(token)) return { status: "invalid" }
  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: { invitedBy: { select: { name: true } } },
  })
  if (!invitation?.email) return { status: "invalid" }

  const verdict = canAcceptInvitation(
    { email: invitation.email, expiresAt: invitation.expiresAt, acceptedAt: invitation.acceptedAt, revokedAt: invitation.revokedAt },
    invitation.email,
  )
  if (verdict !== "ok") return { status: verdict === "emailMismatch" ? "invalid" : verdict }

  return { status: "ok", inviterName: invitation.invitedBy.name, maskedEmail: maskEmail(invitation.email) }
}

/** Carrega o convite e confere estado + e-mail de quem está tentando usar. */
async function loadAcceptableInvitation(token: string, email: string) {
  const t = await getTranslations("api.invitations")
  if (!isInviteTokenFormat(token)) throw new InvitationError("invalid", 404, t("invalid"))

  const invitation = await prisma.invitation.findUnique({
    where: { token },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      invitedById: true,
    },
  })
  if (!invitation?.email) throw new InvitationError("invalid", 404, t("invalid"))

  const verdict = canAcceptInvitation(
    { email: invitation.email, expiresAt: invitation.expiresAt, acceptedAt: invitation.acceptedAt, revokedAt: invitation.revokedAt },
    email,
  )
  if (verdict === "expired") throw new InvitationError("expired", 410, t("expired"))
  if (verdict === "accepted") throw new InvitationError("accepted", 410, t("alreadyAccepted"))
  if (verdict === "revoked") throw new InvitationError("revoked", 410, t("revoked"))
  if (verdict === "emailMismatch") throw new InvitationError("emailMismatch", 403, t("emailMismatch"))

  return invitation
}

/** Aceite criando senha: cria a pessoa (ATIVA, sem plano de contas próprio). */
export async function acceptInvitationWithPassword(input: {
  token: string
  name: string
  email: string
  password: string
}): Promise<{ userId: string; preferencesJson: unknown }> {
  const t = await getTranslations("api.invitations")
  await requirePreparedDatabase()
  const email = normalizeEmail(input.email)
  const invitation = await loadAcceptableInvitation(input.token, email)

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (existing) throw new InvitationError("emailTaken", 409, t("emailTaken"))

  const passwordHash = await bcrypt.hash(input.password, 10)
  const ownerId = await resolveDataOwnerId(invitation.invitedById)

  // TUDO OU NADA: criar a pessoa, apontá-la para o dono e queimar o convite acontecem
  // na mesma transação. Sem isto, uma falha no meio deixaria uma conta ATIVA solta na
  // instalação — e o convidado travado, porque o e-mail já estaria em uso.
  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: input.name.trim() || email,
        email,
        passwordHash,
        role: invitation.role,
        status: "ACTIVE",
      },
      select: { id: true, preferencesJson: true },
    })
    await setDataOwner(user.id, ownerId, tx)
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date(), acceptedByUserId: user.id },
    })
    return user
  })

  return { userId: created.id, preferencesJson: created.preferencesJson }
}

/** Aceite pelo Google: a conta acabou de ser criada no callback; aqui ela vira membro. */
export async function acceptInvitationForUser(input: {
  token: string
  userId: string
  email: string
}): Promise<void> {
  await requirePreparedDatabase()
  const invitation = await loadAcceptableInvitation(input.token, input.email)
  const ownerId = await resolveDataOwnerId(invitation.invitedById)

  // Mesma regra do aceite por senha: ou vira membro por completo, ou nada muda.
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: input.userId },
      data: { role: invitation.role, status: "ACTIVE" },
    })
    await setDataOwner(input.userId, ownerId, tx)
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date(), acceptedByUserId: input.userId },
    })
  })
}

/**
 * Para o callback do Google: este convite serve para ESTE e-mail? Devolve null sem
 * distinguir "não existe" de "não é para você" — quem só tem o link nada descobre.
 */
export async function peekInvitation(
  token: string,
  email: string,
): Promise<{ role: UserRole; ownerId: string } | null> {
  if (!isInviteTokenFormat(token)) return null
  const invitation = await prisma.invitation.findUnique({
    where: { token },
    select: { email: true, role: true, expiresAt: true, acceptedAt: true, revokedAt: true, invitedById: true },
  })
  if (!invitation?.email || !sameEmail(invitation.email, email)) return null
  if (
    canAcceptInvitation(
      { email: invitation.email, expiresAt: invitation.expiresAt, acceptedAt: invitation.acceptedAt, revokedAt: invitation.revokedAt },
      email,
    ) !== "ok"
  ) {
    return null
  }
  return { role: invitation.role, ownerId: await resolveDataOwnerId(invitation.invitedById) }
}
