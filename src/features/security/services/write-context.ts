import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/session"
import { resolveDataOwnerId } from "@/lib/data-owner"
import type { SessionPayload } from "@/lib/auth"
import type { Actor } from "../lib/permissions"
import { PIN_TOKEN_HEADER } from "../lib/http"
import { verifyOverrideToken } from "./pin.service"

export interface WriteContext extends Actor {
  /** Token de PIN válido para ESTE dono e ESTA pessoa; null = sem autorização. */
  override: { ownerId: string; userId: string } | null
}

/**
 * Quem age, a partir da sessão: papel, situação, dono dos dados e vitrine. Único lugar onde o
 * `Actor` nasce — as rotas de escrita chegam por `getWriteContext` e a aba Segurança de
 * Configurações chama isto direto. Montar o ator à mão em dois lugares deixaria o `showcase`
 * (a trava da vitrine) livre para divergir, que é o campo que nunca pode.
 *
 * Devolve null quando a pessoa da sessão sumiu do banco (a tela some, a rota responde 401).
 */
export async function buildActor(session: SessionPayload): Promise<Actor | null> {
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { role: true, status: true } })
  if (!user) return null
  const ownerId = await resolveDataOwnerId(session.userId)
  return {
    actorUserId: session.userId,
    ownerId,
    role: user.role,
    status: user.status,
    showcase: session.demoShared === true,
  }
}

/**
 * Contraparte de getWriteContext para SERVER ACTIONS (orçamento): o mesmo ator, sem cabeçalho de
 * PIN, porque uma server action não carrega cabeçalho nenhum. Sem sessão real, null (a action falha
 * do jeito que já falhava). É por aqui que a escrita fora de /api deixa de cair no resolvedor de
 * leitura, que fora de produção devolvia o usuário mais antigo do banco quando não havia sessão.
 */
export async function getWriteActor(): Promise<Actor | null> {
  const session = await getSession()
  if (!session) return null
  return buildActor(session)
}

/** Substitui getDefaultUserId nas rotas de escrita: sem sessão real, null (a rota devolve 401). */
export async function getWriteContext(request: Request, opts: { allowOverride?: boolean } = {}): Promise<WriteContext | null> {
  const session = await getSession()
  if (!session) return null
  const actor = await buildActor(session)
  if (!actor) return null
  const raw = opts.allowOverride === false ? null : request.headers.get(PIN_TOKEN_HEADER)
  const decoded = raw ? await verifyOverrideToken(raw) : null
  const override = decoded && decoded.ownerId === actor.ownerId && decoded.userId === session.userId ? decoded : null
  return { ...actor, override }
}
