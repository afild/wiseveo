import { cache } from "react"
import { prisma } from "@/lib/prisma"

/**
 * Dono dos dados financeiros de uma requisição.
 *
 * Quem entrou por convite lança na conta de quem convidou: `users.data_owner_id`
 * guarda esse dono; vazio = a pessoa é dona de si.
 *
 * Por que consulta direta e não um campo do Prisma: metade do app lê a linha inteira
 * de `users`, e mapear no schema uma coluna que a instalação ainda não tem derrubaria
 * TODAS essas leituras de uma vez (P2022). Aqui a ausência é tratada à parte — o
 * sistema segue funcionando como sempre até o dono clicar em "Preparar meu banco"
 * (Configurações → Usuários).
 *
 * TOLERÂNCIA ESTREITA, de propósito: só a coluna faltando devolve "cada um é dono de
 * si". Qualquer outra falha do banco SOBE. Engolir um banco instável aqui faria a
 * pessoa convidada gravar transações em nome dela — lançamentos que sumiriam de todas
 * as telas assim que a consulta voltasse a funcionar.
 *
 * Use em TUDO que é dado financeiro (transações, contas, orçamento, dashboard, plano
 * de contas…). Perfil, preferências, tema, idioma e integrações continuam por usuário
 * real (getSessionUserId / getSettingsUserId).
 */

/** Só o `$executeRaw` interessa aqui — serve tanto para o Prisma quanto para uma transação. */
type RawExecutor = Pick<typeof prisma, "$executeRaw">

/**
 * A coluna existe? Memorizado: "existe" vale para sempre (ninguém a remove); "não
 * existe" vale por pouco tempo, para o app perceber sozinho o clique em "Preparar
 * meu banco" sem precisar de reinício.
 */
const ABSENCE_TTL_MS = 60_000
let columnPresent = false
let absenceCheckedAt = 0

export async function hasDataOwnerColumn(now = Date.now()): Promise<boolean> {
  if (columnPresent) return true
  if (absenceCheckedAt && now - absenceCheckedAt < ABSENCE_TTL_MS) return false

  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'data_owner_id'
  `
  columnPresent = Number(rows[0]?.count ?? 0) > 0
  absenceCheckedAt = columnPresent ? 0 : now
  return columnPresent
}

/** Só para os testes: esquece o que foi memorizado sobre a coluna. */
export function resetDataOwnerColumnCache() {
  columnPresent = false
  absenceCheckedAt = 0
}

/** A falha foi só a coluna não existir? Em caso de dúvida, NÃO tolera. */
async function isMissingColumn(): Promise<boolean> {
  try {
    return !(await hasDataOwnerColumn())
  } catch {
    return false
  }
}

export const resolveDataOwnerId = cache(async (userId: string): Promise<string> => {
  try {
    const rows = await prisma.$queryRaw<Array<{ data_owner_id: string | null }>>`
      SELECT data_owner_id FROM users WHERE id = ${userId} LIMIT 1
    `
    return rows[0]?.data_owner_id ?? userId
  } catch (error) {
    if (await isMissingColumn()) return userId
    throw error
  }
})

/** Verdadeiro quando a pessoa entrou por convite (os dados são de outra). */
export async function isAccountMember(userId: string): Promise<boolean> {
  return (await resolveDataOwnerId(userId)) !== userId
}

/**
 * Passa a lançar na conta do dono. Só o aceite de convite chama isto, e sempre dentro
 * da transação do aceite — se aqui falhar, nada do aceite fica de pé.
 */
export async function setDataOwner(
  userId: string,
  dataOwnerId: string,
  client: RawExecutor = prisma,
): Promise<void> {
  // i18n-ignore: SQL bruto, não é texto de UI
  const affected = await client.$executeRaw`UPDATE users SET data_owner_id = ${dataOwnerId} WHERE id = ${userId}`
  if (affected === 0) {
    throw new Error(`data owner not set for ${userId}`) // i18n-ignore: erro interno, a rota traduz
  }
}

/** Ids de todo mundo que enxerga a conta deste dono (ele + quem ele convidou). */
export async function listAccountMemberIds(ownerId: string): Promise<string[]> {
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM users WHERE id = ${ownerId} OR data_owner_id = ${ownerId}
    `
    return rows.map((row) => row.id)
  } catch (error) {
    if (await isMissingColumn()) return [ownerId]
    throw error
  }
}
