import { prisma } from "@/lib/prisma"

/** E-mail do usuário-vitrine (semeado por db:seed:demo; já existe no banco da demo). */
const VITRINE_EMAIL = process.env.DEMO_VITRINE_EMAIL ?? "demo@wiseveo.com"

let cache: { id: string; at: number } | null = null

/**
 * Devolve o id da vitrine, ou null se ela não existir — aí a entrada degrada
 * para o provisionamento clássico (a demo nunca fica presa na vitrine).
 * Cache de 60s: a entrada é o caminho mais quente da demo.
 */
export async function getVitrineUserId(): Promise<string | null> {
  if (cache && Date.now() - cache.at < 60_000) return cache.id
  const u = await prisma.user.findUnique({
    where: { email: VITRINE_EMAIL },
    select: { id: true },
  })
  if (!u) return null
  cache = { id: u.id, at: Date.now() }
  return u.id
}
