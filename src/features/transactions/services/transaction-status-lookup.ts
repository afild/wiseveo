import { prisma } from "@/lib/prisma"

/**
 * CATÁLOGO DE STATUS — leitura única do sistema.
 *
 * POR QUE NÃO EXISTE FILTRO POR USUÁRIO AQUI (e por que não se deve recolocar um):
 *
 * `TransactionStatusLookup.code` é `@unique` GLOBAL no schema
 * (`code Int @unique @map("COD_ST")`), e tanto `Transaction.statusCode` quanto
 * `RecurringTransaction.statusCode` são chaves estrangeiras para esse `code`.
 * Existem, portanto, no máximo quatro linhas na base inteira, e os lançamentos
 * de TODO mundo já apontam para elas. A ordem 1 Paid, 2 Pending, 3 Overdue,
 * 4 Scheduled é só a do seed atual: banco criado antes dele amarra os códigos
 * de outro jeito (o do dono tem 1 PAGO, 2 ABERTO, 3 PENDENTE, 4 VENCIDO). O
 * código é chave estrangeira, nunca significado; o significado vem do NOME,
 * via `normalizeStatusName` em `src/lib/paid-status.ts`.
 * O `user_id` da linha é apenas o dono de referência, nunca isolamento: está
 * escrito assim no desenho, em `src/lib/user-init.ts`, onde os dois ramos do
 * `initializeUserData` fazem upsert por `code` (o ramo phantom/demo com
 * `update: {}`, que preserva o dono atual; o ramo real com `update: { userId }`,
 * que reatribui o dono). Nenhum caminho do app cria, atualiza ou apaga status.
 *
 * O estrago que o filtro fazia: quem não fosse o dono da vez recebia lista
 * vazia. Na demo isso valia para toda cópia de visitante, e o formulário de novo
 * lançamento ficava sem status nenhum, recusando o envio em silêncio. Com
 * cadastro público ligado o efeito se inverte: o segundo usuário real reatribui
 * as quatro linhas e é o PRIMEIRO que passa a ver a lista vazia.
 */

/** As quatro linhas do catálogo, em ordem de nome. */
export function listTransactionStatuses() {
  return prisma.transactionStatusLookup.findMany({
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  })
}

/** Uma linha do catálogo pelo código, ou `null` quando o código não existe. */
export function findTransactionStatusByCode(code: number) {
  return prisma.transactionStatusLookup.findFirst({
    where: { code },
    select: { code: true },
  })
}
