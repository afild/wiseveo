import { prisma } from "@/lib/prisma"

/**
 * E-mail do usuário-vitrine (semeado por db:seed:demo; já existe no banco da demo).
 * Função, não const de módulo: lida com env ainda não setada no import (edge/cold
 * start) e mantém o MESMO fallback/normalização do seed (prisma/seed-demo.ts:40
 * grava `SEED_DEMO_EMAIL?.trim().toLowerCase() || "demo@wiseveo.com"`) — leitor e
 * semeador têm de concordar no e-mail, ou a vitrine nunca é encontrada.
 */
function vitrineEmail(): string {
  return (process.env.DEMO_VITRINE_EMAIL ?? process.env.SEED_DEMO_EMAIL ?? "demo@wiseveo.com")
    .trim()
    .toLowerCase()
}

const CACHE_TTL_MS = 60_000
let cache: { id: string; at: number } | null = null
let warned = false

/**
 * Derruba o cache da vitrine. Uso: depois de re-semear a vitrine (db:seed:demo),
 * o id antigo pode ser servido por até 60s — sessões emitidas nessa janela apontam
 * para um usuário morto por 24h. Esta é a saída do operador.
 */
export function invalidateVitrineCache(): void {
  cache = null
}

/**
 * Devolve o id da vitrine, ou null se ela não existir — aí a entrada degrada
 * para o provisionamento clássico (a demo nunca fica presa na vitrine).
 * Cache de 60s: a entrada é o caminho mais quente da demo.
 */
export async function getVitrineUserId(): Promise<string | null> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.id
  const user = await prisma.user.findUnique({
    where: { email: vitrineEmail() },
    select: { id: true },
  })
  if (!user) {
    // Degrada em silêncio para quem visita (a demo continua no ar), mas avisa
    // uma vez por instância: sem isto, o modo caro (2.647 linhas/visita) passa
    // despercebido nos logs até alguém notar o banco crescendo.
    if (!warned) {
      warned = true
      console.warn(
        `Vitrine ausente (${vitrineEmail()}): demo caiu no provisionamento clássico (2.647 linhas por visita).`,
      )
    }
    return null
  }
  cache = { id: user.id, at: Date.now() }
  return user.id
}
