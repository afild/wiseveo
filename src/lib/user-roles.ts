/**
 * Regras de papel (puras, sem banco):
 *
 * - USER: usa tudo, menos administrar.
 * - ADMIN: aprova e remove usuários comuns.
 * - SUPERADMIN: promove/rebaixa qualquer um, até SUPERADMIN.
 * - Ninguém altera/remove a si mesmo por aqui. `targetIsDataOwner` protege o dono
 *   dos dados de ser rebaixado/removido por outros — hoje sempre falso (não há
 *   coluna de dono no banco); volta a valer quando os convites existirem.
 */
export type UserRole = "USER" | "ADMIN" | "SUPERADMIN"

export const USER_ROLES: readonly UserRole[] = ["USER", "ADMIN", "SUPERADMIN"] as const

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value)
}

const RANK: Record<UserRole, number> = { USER: 0, ADMIN: 1, SUPERADMIN: 2 }

export interface RoleChangeInput {
  actorRole: UserRole
  targetRole: UserRole
  newRole: UserRole
  isSelf: boolean
  targetIsDataOwner: boolean
}

export type RoleChangeVerdict = "ok" | "self" | "dataOwner" | "notAdmin" | "aboveActor" | "sameRole"

/** Pode `actor` mudar o papel de `target` para `newRole`? */
export function canChangeRole(input: RoleChangeInput): RoleChangeVerdict {
  const { actorRole, targetRole, newRole, isSelf, targetIsDataOwner } = input
  if (RANK[actorRole] < RANK.ADMIN) return "notAdmin"
  if (isSelf) return "self"
  if (targetIsDataOwner) return "dataOwner"
  if (targetRole === newRole) return "sameRole"
  // Só SUPERADMIN mexe em SUPERADMIN (rebaixar) ou promove a SUPERADMIN.
  if (RANK[targetRole] >= RANK[actorRole] || RANK[newRole] >= RANK[actorRole]) {
    return actorRole === "SUPERADMIN" ? "ok" : "aboveActor"
  }
  return "ok"
}

export type RemoveVerdict = "ok" | "self" | "dataOwner" | "notAdmin" | "aboveActor"

/** Pode `actor` remover `target` da conta? */
export function canRemoveUser(input: Omit<RoleChangeInput, "newRole">): RemoveVerdict {
  const { actorRole, targetRole, isSelf, targetIsDataOwner } = input
  if (RANK[actorRole] < RANK.ADMIN) return "notAdmin"
  if (isSelf) return "self"
  if (targetIsDataOwner) return "dataOwner"
  if (RANK[targetRole] >= RANK[actorRole] && actorRole !== "SUPERADMIN") return "aboveActor"
  return "ok"
}

/** Papéis que `actor` pode atribuir num convite. */
export function invitableRoles(actorRole: UserRole): UserRole[] {
  if (actorRole === "SUPERADMIN") return ["USER", "ADMIN"]
  if (actorRole === "ADMIN") return ["USER"]
  return []
}
