import { cache } from "react"
import { prisma } from "@/lib/prisma"

/**
 * Dono dos dados financeiros de uma requisição.
 *
 * Quem entrou por convite lança na conta de quem convidou: `users.data_owner_id`
 * guarda esse dono; vazio (ou coluna inexistente) = a pessoa é dona de si.
 *
 * Por que consulta direta e não um campo do Prisma: metade do app lê a linha inteira
 * de `users`, e mapear no schema uma coluna que a instalação ainda não tem derrubaria
 * TODAS essas leituras de uma vez (P2022). Aqui a ausência é só um `catch` — o sistema
 * segue funcionando como sempre até o dono clicar em "Preparar meu banco"
 * (Configurações → Usuários).
 *
 * Use em TUDO que é dado financeiro (transações, contas, orçamento, dashboard, plano
 * de contas…). Perfil, preferências, tema, idioma e integrações continuam por usuário
 * real (getSessionUserId / getSettingsUserId).
 */
export const resolveDataOwnerId = cache(async (userId: string): Promise<string> => {
  try {
    const rows = await prisma.$queryRaw<Array<{ data_owner_id: string | null }>>`
      SELECT data_owner_id FROM users WHERE id = ${userId} LIMIT 1
    `
    return rows[0]?.data_owner_id ?? userId
  } catch {
    // Coluna ainda não existe nesta instalação (banco não preparado) ou falha
    // transitória: a pessoa é dona de si — o comportamento de sempre.
    return userId
  }
})

/** Verdadeiro quando a pessoa entrou por convite (os dados são de outra). */
export async function isAccountMember(userId: string): Promise<boolean> {
  return (await resolveDataOwnerId(userId)) !== userId
}

/**
 * Passa a lançar na conta do dono. Só o aceite de convite chama isto.
 * Falha se a coluna não existir — e aí o aceite inteiro é abortado, de propósito:
 * é melhor recusar o convite do que criar uma pessoa solta na instalação.
 */
export async function setDataOwner(userId: string, dataOwnerId: string): Promise<void> {
  // i18n-ignore: SQL bruto, não é texto de UI
  await prisma.$executeRaw`UPDATE users SET data_owner_id = ${dataOwnerId} WHERE id = ${userId}`
}

/** Ids de todo mundo que enxerga a conta deste dono (ele + quem ele convidou). */
export async function listAccountMemberIds(ownerId: string): Promise<string[]> {
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM users WHERE id = ${ownerId} OR data_owner_id = ${ownerId}
    `
    return rows.map((row) => row.id)
  } catch {
    return [ownerId]
  }
}
