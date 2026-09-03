import { isActiveUser, isAdminRole } from "@/lib/user-approval"

/** Quem está agindo, já com o dono dos dados resolvido. Rotas e página montam de getSession;
 *  o tique monta com showcase=false; componentes NÃO chamam isto (leem os booleanos da API). */
export interface Actor {
  actorUserId: string
  ownerId: string
  role: string
  status: string
  /** Sessão de vitrine da demo (claim demoShared). */
  showcase: boolean
}

export const isShowcase = (a: Actor) => a.showcase
export const isDataOwner = (a: Actor) => a.actorUserId === a.ownerId
export const canManageClosing = (a: Actor) =>
  !a.showcase && isActiveUser(a.status) && (isDataOwner(a) || isAdminRole(a.role))
export const canManagePin = (a: Actor) => !a.showcase && isActiveUser(a.status) && isDataOwner(a)
