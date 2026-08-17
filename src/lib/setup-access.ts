import { prisma } from "@/lib/prisma"
import { getSessionUserId } from "@/lib/session"
import { isSetupComplete } from "@/lib/setup-check"

/**
 * Quem pode usar o Setup Wizard (página e rotas /api/setup/*):
 * - instalação ainda NÃO configurada → qualquer visitante (é a instalação inicial);
 * - instalação configurada → só SUPERADMIN logado ("Reconfigurar" — testes de
 *   conexão/interface). Anônimos continuam vendo 404, como antes.
 */
export async function canAccessSetup(): Promise<boolean> {
  if (!isSetupComplete()) return true
  return isSuperAdminSession()
}

export async function isSuperAdminSession(): Promise<boolean> {
  try {
    const userId = await getSessionUserId()
    if (!userId) return false
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, status: true } })
    return user?.status === "ACTIVE" && user.role === "SUPERADMIN"
  } catch {
    return false
  }
}
