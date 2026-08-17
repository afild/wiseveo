import { cache } from "react"
import { prisma } from "@/lib/prisma"

/**
 * Conta compartilhada: um usuário convidado enxerga e lança os dados do DONO da
 * conta (users.data_owner_id). Quem não foi convidado é dono de si mesmo.
 *
 * Use `resolveDataOwnerId` para TUDO que é dado financeiro (transações, contas,
 * orçamento, dashboard, plano de contas…). Perfil, preferências, tema, idioma e
 * integrações continuam por usuário real (getSessionUserId / getSettingsUserId).
 */
export const resolveDataOwnerId = cache(async (userId: string): Promise<string> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { dataOwnerId: true },
    })
    return user?.dataOwnerId ?? userId
  } catch {
    // Coluna ainda ausente (banco anterior a esta feature) ou falha transitória:
    // o usuário é dono de si mesmo — comportamento idêntico ao de antes.
    return userId
  }
})

/** Verdadeiro quando o usuário é membro convidado (dados pertencem a outra pessoa). */
export async function isAccountMember(userId: string): Promise<boolean> {
  return (await resolveDataOwnerId(userId)) !== userId
}
