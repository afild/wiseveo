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
