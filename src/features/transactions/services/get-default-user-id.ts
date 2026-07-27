import { prisma } from "@/lib/prisma"
import { getSessionUserId } from "@/lib/session"

/**
 * Resolve o usuário dono dos dados da requisição atual.
 *
 * PRIMEIRO a sessão (cookie), SEMPRE. O fallback "usuário mais antigo do banco"
 * só existe para contextos sem sessão (ex.: renderização fora de uma requisição
 * ou base recém-semeada) e é o comportamento legado desta função.
 *
 * Sem a checagem de sessão, todo usuário logado enxergava os dados do PRIMEIRO
 * usuário criado no banco — na demo, isso significava que nenhum visitante via
 * o próprio conjunto provisionado.
 */
export async function getDefaultUserId(): Promise<string | null> {
  try {
    const sessionUserId = await getSessionUserId()
    if (sessionUserId) {
      return sessionUserId
    }
  } catch {
    // Fora do escopo de uma requisição (sem cookies disponíveis) — cai no fallback.
  }

  // Em produção NÃO há fallback: `src/middleware.ts` exclui `/api` do matcher de
  // autenticação, então uma requisição anônima a uma rota de API chegaria aqui e
  // receberia os dados do primeiro usuário cadastrado. Sem sessão, sem usuário —
  // os chamadores já tratam `null` devolvendo 401.
  if (process.env.NODE_ENV === "production") {
    return null
  }

  try {
    const user = await prisma.user.findFirst({
      select: { id: true },
      orderBy: { createdAt: "asc" },
    })
    if (user?.id) {
      return user.id
    }
  } catch {
    // Fallback to legacy schema when Prisma models do not match DB tables
  }

  try {
    const legacyUsers = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM public.users
      ORDER BY created_at ASC
      LIMIT 1
    `
    return legacyUsers[0]?.id ?? null
  } catch {
    return null
  }
}
