/**
 * O QUE CONTA COMO "PAGO" — definição única do sistema.
 *
 * O status é um lookup com NOME livre (`transaction_statuses.STATUS`), então a
 * decisão é sempre pelo nome, sem diferenciar maiúsculas nem espaços nas pontas.
 *
 * Por que centralizar: até aqui a mesma pergunta dava respostas diferentes
 * conforme a tela — orçamento e gráfico do painel reconheciam só "Pago"/"Paid",
 * enquanto insights e "últimos pagos" também aceitavam "Paga", "Realizado" e
 * "Quitado". Um lançamento "Quitado" aparecia como pago num lugar e como
 * agendado no outro. Com o agente perguntando aos mesmos serviços, essa
 * divergência viraria números contraditórios na mesma resposta.
 *
 * A lista é a UNIÃO de todas as que existiam: nada que já era pago deixa de
 * ser. Em banco com os nomes padrão em inglês (Paid/Pending/Overdue/Scheduled)
 * nada muda.
 */
export const PAID_STATUS_NAMES = ["PAGO", "PAID", "PAGA", "REALIZADO", "QUITADO"] as const

/** Filtro Prisma: lançamentos cujo status significa pago. */
export function paidStatusFilter() {
  return {
    OR: PAID_STATUS_NAMES.map((name) => ({
      statusLookup: {
        is: { name: { equals: name, mode: "insensitive" as const } },
      },
    })),
  }
}

/** Filtro Prisma: o oposto — tudo que ainda não foi pago. */
export function unpaidStatusFilter() {
  return { NOT: paidStatusFilter() }
}

/** Decisão em memória (para dados já carregados). Tolera espaços e caixa. */
export function isPaidStatusName(name: string | null | undefined): boolean {
  if (!name) return false
  const normalized = name.trim().toUpperCase()
  return (PAID_STATUS_NAMES as readonly string[]).includes(normalized)
}

/** Os quatro significados que o sistema reconhece para um status. */
export type TransactionStatusKey = "PAID" | "PENDING" | "OVERDUE" | "SCHEDULED"

const OVERDUE_STATUS_NAMES = ["VENCIDO", "OVERDUE"] as const
const SCHEDULED_STATUS_NAMES = ["ABERTO", "AGENDADO", "SCHEDULED"] as const
const PENDING_STATUS_NAMES = ["PENDENTE", "PENDING"] as const

/**
 * SIGNIFICADO DE UM STATUS: SEMPRE pelo NOME, nunca pelo código.
 *
 * O código (`transaction_statuses.COD_ST`) é só chave estrangeira. Catálogos
 * antigos amarram os códigos de outro jeito: o banco do dono tem 1 PAGO,
 * 2 ABERTO, 3 PENDENTE, 4 VENCIDO, enquanto o seed atual cria 1 Paid,
 * 2 Pending, 3 Overdue, 4 Scheduled. Como o user-init nunca renomeia linha
 * existente, os dois mundos convivem, e qualquer tabela "código -> rótulo"
 * mostra o status errado num deles.
 *
 * Devolve `null` para nome fora do conjunto conhecido: quem chama decide o
 * fallback (a tabela cai em PENDING, o rótulo cai no nome cru do banco).
 */
export function normalizeStatusName(name: string | null | undefined): TransactionStatusKey | null {
  const key = (name ?? "").trim().toUpperCase()
  if (!key) return null
  if (isPaidStatusName(key)) return "PAID"
  if ((OVERDUE_STATUS_NAMES as readonly string[]).includes(key)) return "OVERDUE"
  if ((SCHEDULED_STATUS_NAMES as readonly string[]).includes(key)) return "SCHEDULED"
  if ((PENDING_STATUS_NAMES as readonly string[]).includes(key)) return "PENDING"
  return null
}
