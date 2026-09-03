import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/session"
import { resolveDataOwnerId } from "@/lib/data-owner"
import type { Actor } from "../lib/permissions"
import { PIN_TOKEN_HEADER } from "../lib/http"
import { verifyOverrideToken } from "./pin.service"

export interface WriteContext extends Actor {
  /** Token de PIN válido para ESTE dono e ESTA pessoa; null = sem autorização. */
  override: { ownerId: string; userId: string } | null
}

/** Substitui getDefaultUserId nas rotas de escrita: sem sessão real, null (a rota devolve 401). */
export async function getWriteContext(request: Request, opts: { allowOverride?: boolean } = {}): Promise<WriteContext | null> {
  const session = await getSession()
  if (!session) return null
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { role: true, status: true } })
  if (!user) return null
  const ownerId = await resolveDataOwnerId(session.userId)
  const raw = opts.allowOverride === false ? null : request.headers.get(PIN_TOKEN_HEADER)
  const decoded = raw ? await verifyOverrideToken(raw) : null
  const override = decoded && decoded.ownerId === ownerId && decoded.userId === session.userId ? decoded : null
  return { actorUserId: session.userId, ownerId, role: user.role, status: user.status, showcase: session.demoShared === true, override }
}
