import { getTranslations } from "next-intl/server"
import { prisma } from "@/lib/prisma"
import {
  BOOTSTRAP_ADMIN_EMAIL,
  isAdminRole,
  isBootstrapAdminEmail,
  isActiveUser,
} from "@/lib/user-approval"
import { resolveDataOwnerId } from "@/lib/data-owner"
import { canChangeRole, canRemoveUser, isUserRole, type UserRole } from "@/lib/user-roles"

export interface AdminUserSummary {
  id: string
  name: string
  email: string
  role: "USER" | "ADMIN" | "SUPERADMIN"
  status: "PENDING" | "ACTIVE"
  createdAt: string
  updatedAt: string
  /** Dono dos dados que este usuário enxerga (null = ele mesmo). */
  dataOwnerId: string | null
  /** Membro convidado da conta de outra pessoa. */
  isMember: boolean
}

export class AdminAccessError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "AdminAccessError"
    this.status = status
  }
}

const ADMIN_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  dataOwnerId: true,
} as const

function serializeAdminUser(user: {
  id: string
  name: string
  email: string
  role: "USER" | "ADMIN" | "SUPERADMIN"
  status: "PENDING" | "ACTIVE"
  createdAt: Date
  updatedAt: Date
  dataOwnerId: string | null
}): AdminUserSummary {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    dataOwnerId: user.dataOwnerId,
    isMember: user.dataOwnerId !== null,
  }
}

export async function requireAdminUser(userId: string | null) {
  const t = await getTranslations("settings.adminUsers.errors")

  if (!userId) {
    throw new AdminAccessError(401, t("notAuthenticated"))
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, status: true },
  })

  if (!user || !isActiveUser(user.status) || !isAdminRole(user.role)) {
    throw new AdminAccessError(403, t("adminOnly"))
  }

  return user
}

export async function getUserAdminAccess(userId: string | null) {
  if (!userId) return { isAdmin: false }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, status: true },
  })

  return {
    isAdmin: Boolean(user && isActiveUser(user.status) && isAdminRole(user.role)),
  }
}

export async function listUsersForAdmin(): Promise<AdminUserSummary[]> {
  const users = await prisma.user.findMany({
    select: ADMIN_USER_SELECT,
    orderBy: { createdAt: "desc" },
  })

  return users
    .map(serializeAdminUser)
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "PENDING" ? -1 : 1
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
}

export async function approveUser(userId: string): Promise<AdminUserSummary> {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  })

  if (!target) {
    const t = await getTranslations("settings.adminUsers.errors")
    throw new AdminAccessError(404, t("userNotFound"))
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      status: "ACTIVE",
      role: isBootstrapAdminEmail(target.email) ? "SUPERADMIN" : "USER",
    },
    select: ADMIN_USER_SELECT,
  })

  return serializeAdminUser(updatedUser)
}

async function loadActorAndTarget(actorId: string, targetId: string) {
  const t = await getTranslations("settings.adminUsers.errors")
  const [actor, target, ownerId] = await Promise.all([
    prisma.user.findUnique({ where: { id: actorId }, select: { id: true, role: true, status: true } }),
    prisma.user.findUnique({ where: { id: targetId }, select: ADMIN_USER_SELECT }),
    resolveDataOwnerId(actorId),
  ])
  if (!actor || !isActiveUser(actor.status) || !isAdminRole(actor.role)) {
    throw new AdminAccessError(403, t("adminOnly"))
  }
  if (!target) throw new AdminAccessError(404, t("userNotFound"))
  return { actor, target, targetIsDataOwner: target.id === ownerId }
}

/** Promove/rebaixa um usuário (regras em src/lib/user-roles.ts). */
export async function setUserRole(actorId: string, targetId: string, role: unknown): Promise<AdminUserSummary> {
  const t = await getTranslations("settings.adminUsers.errors")
  if (!isUserRole(role)) throw new AdminAccessError(400, t("invalidRole"))
  const { actor, target, targetIsDataOwner } = await loadActorAndTarget(actorId, targetId)

  const verdict = canChangeRole({
    actorRole: actor.role as UserRole,
    targetRole: target.role,
    newRole: role,
    isSelf: actor.id === target.id,
    targetIsDataOwner,
  })
  if (verdict === "sameRole") return serializeAdminUser(target)
  if (verdict !== "ok") throw new AdminAccessError(403, t(`roleChange.${verdict}`))

  const updated = await prisma.user.update({ where: { id: targetId }, data: { role }, select: ADMIN_USER_SELECT })
  return serializeAdminUser(updated)
}

/**
 * Remove um usuário da instalação. Dados financeiros de membros são do dono
 * (userId = dono), então nada financeiro se perde; conexões pessoais (Telegram,
 * memória de conversa) caem em cascata.
 */
export async function removeUser(actorId: string, targetId: string): Promise<void> {
  const t = await getTranslations("settings.adminUsers.errors")
  const { actor, target, targetIsDataOwner } = await loadActorAndTarget(actorId, targetId)
  const verdict = canRemoveUser({
    actorRole: actor.role as UserRole,
    targetRole: target.role,
    isSelf: actor.id === target.id,
    targetIsDataOwner,
  })
  if (verdict !== "ok") throw new AdminAccessError(403, t(`roleChange.${verdict}`))
  await prisma.user.delete({ where: { id: targetId } })
}

export function getBootstrapAdminEmail() {
  return BOOTSTRAP_ADMIN_EMAIL
}
