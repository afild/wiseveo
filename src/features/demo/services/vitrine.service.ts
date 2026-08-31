import { prisma } from "@/lib/prisma"

/**
 * E-mail do usuário-vitrine (semeado por db:seed:demo; já existe no banco da demo).
 * Função, não const de módulo: não congela o valor no primeiro import (override e
 * teste alcançam) e mantém o MESMO fallback/normalização do seed (prisma/seed-demo.ts:40
 * grava `SEED_DEMO_EMAIL?.trim().toLowerCase() || "demo@wiseveo.com"`) — leitor e
 * semeador têm de concordar no e-mail, ou a vitrine nunca é encontrada.
 */
function vitrineEmail(): string {
  const configurado = (process.env.DEMO_VITRINE_EMAIL ?? process.env.SEED_DEMO_EMAIL ?? "")
    .trim()
    .toLowerCase()
  // `||`, não `??`: variável definida e VAZIA é o caso comum (o .env.example traz
  // `DEMO_VITRINE_EMAIL=""`; a Vercel guarda "" para campo em branco). Mesma
  // escolha de prisma/seed-demo.ts:40 — senão o leitor procura "" e nunca acha.
  return configurado || "demo@wiseveo.com"
}

const CACHE_TTL_MS = 60_000
let cache: { id: string; at: number } | null = null
let warned = false

/**
 * Derruba o cache da vitrine. Uso: depois de re-semear a vitrine (db:seed:demo),
 * o id antigo pode ser servido por até 60s — sessões emitidas nessa janela apontam
 * para um usuário morto por 24h. Hoje nada chama isto em runtime (e uma rota só
 * limparia a instância que a atendesse): após re-semear, aguarde 60s ou redeploy;
 * o export existe por paridade com os irmãos (telegram-config/ai-config) e para
 * uma futura rota de admin.
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
        // i18n-ignore: log de operação (Vercel), nunca renderizado em UI
        `Vitrine ausente (${vitrineEmail()}): demo caiu no provisionamento clássico (2.647 linhas por visita).`,
      )
    }
    return null
  }
  cache = { id: user.id, at: Date.now() }
  // A vitrine voltou: rearma o aviso para um sumiço FUTURO não passar em silêncio.
  warned = false
  return user.id
}
