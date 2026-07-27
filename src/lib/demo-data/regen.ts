// WISEVEO — miolo compartilhado do "wipe-and-replace" do dataset de demonstração.
//
// Consumido por dois scripts (nenhum caminho de request da aplicação usa este módulo):
//   - scripts/regen-demo-user.ts  → regenera UM usuário existente, identificado por e-mail
//   - prisma/seed-demo.ts         → semeia/regenera o usuário demo permanente
//
// A rota src/app/api/demo/provision/route.ts NÃO usa este módulo de propósito: lá o
// usuário e o plano de contas nascem na MESMA transação, então o fluxo é outro.
//
// Regras invioláveis (premissa P13 — "sem danos aos dados de outros usuários"):
//   - só apaga linhas filtradas por `userId`;
//   - exige que o usuário JÁ tenha plano de contas PREFIXADO (isolado) — aborta se não tiver;
//   - nunca toca em CategoryGroup / Category / Account (exceto `balance`) / TransactionStatusLookup.

import { getDemoDataset } from "./generate-demo-dataset"
import { materializeDataset } from "./materialize"

/**
 * Cliente Prisma (ou transação) tipado de forma frouxa de propósito — mesma decisão de
 * `initializeUserData(tx: any, ...)` em src/lib/user-init.ts. Os consumidores constroem o
 * próprio PrismaClient a partir de src/generated/prisma_new/client; importar o client
 * gerado aqui só serviria para arrastar peso desnecessário para o bundle da aplicação.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PrismaLike = any

export type RegenCounts = {
  transactions: number
  recurring: number
  budgets: number
  payees: number
}

export type RegenResult = {
  /** Prefixo de 8 chars derivado do plano de contas do usuário (namespace de isolamento). */
  prefix: string
  deleted: RegenCounts
  inserted: RegenCounts
  accountBalances: Record<number, number>
}

/** Os 9 grupos do plano de contas padrão, em códigos originais (pré-offset). */
const EXPECTED_GROUP_CODES = [100, 200, 300, 400, 500, 600, 700, 800, 900]

/**
 * Apaga transactions / recurring / budgets / payees do usuário e recria tudo a partir do
 * dataset determinístico, reaproveitando accounts + categoryGroups + categories que ele já tem.
 *
 * Tudo acontece dentro de uma única transação: ou o usuário fica com o dataset novo inteiro,
 * ou fica exatamente como estava.
 */
export async function regenerateUserDemoData(
  prisma: PrismaLike,
  userId: string
): Promise<RegenResult> {
  const accounts: Array<{ id: number; type: string }> = await prisma.account.findMany({
    where: { userId },
    select: { id: true, type: true },
  })
  const groups: Array<{ id: string; code: number }> = await prisma.categoryGroup.findMany({
    where: { userId },
    select: { id: true, code: true },
  })
  const cats: Array<{ code: string }> = await prisma.category.findMany({
    where: { userId },
    select: { code: true },
    take: 1,
  })

  if (!accounts.length || !groups.length || !cats.length) {
    // i18n-ignore: mensagem interna de script/erro, nunca exibida ao usuário
    throw new Error(`regenerateUserDemoData: usuario ${userId} sem plano de contas; abortando.`)
  }

  // O prefixo não é persistido em coluna própria: ele vive no code da categoria
  // ("de305eed.300.001"). Um code sem prefixo ("300.001") significa que o usuário está nos
  // códigos GLOBAIS compartilhados — regenerar assim contaminaria outros usuários.
  const prefix = cats[0].code.split(".")[0]
  if (prefix.length < 6) {
    throw new Error(
      // i18n-ignore: mensagem interna de script/erro, nunca exibida ao usuário
      `regenerateUserDemoData: categoria sem prefixo (${cats[0].code}) — usuario ${userId} NAO isolado; abortando.`
    )
  }

  const accountIds: Record<string, number> = {}
  for (const a of accounts) accountIds[a.type] = a.id

  // groupCodeOffset: phantomGroupCode = 1_000_000 + slotOffset + originalCode, com
  // slotOffset arbitrário (derivado do prefixo, não persistido). NÃO usar `code % 1000`
  // — isso só devolve o originalCode quando slotOffset é múltiplo de 1000; no caso
  // geral produz um mapeamento ERRADO (ex.: code 1796563 → 563, não 100), e os budgets
  // ganhariam um groupId indefinido ou trocado. O conjunto é sempre base+100 … base+900,
  // então o offset se recupera com min(code) - 100 (mesma técnica de
  // src/app/api/demo/provision/route.ts e scripts/fix-demo-statuses.ts).
  const groupCodeOffset = Math.min(...groups.map((g) => g.code)) - 100
  const groupUuidByCode: Record<number, string> = {}
  for (const g of groups) groupUuidByCode[g.code - groupCodeOffset] = g.id

  if (
    groups.length !== EXPECTED_GROUP_CODES.length ||
    EXPECTED_GROUP_CODES.some((code) => !groupUuidByCode[code])
  ) {
    // i18n-ignore: mensagem interna de script/erro, nunca exibida ao usuário
    throw new Error(`regenerateUserDemoData: conjunto de grupos inesperado para ${userId}.`)
  }

  return await prisma.$transaction(
    async (tx: PrismaLike): Promise<RegenResult> => {
      // Ordem respeita FKs: transactions (referencia payeeId) antes de payees.
      const delTx = await tx.transaction.deleteMany({ where: { userId } })
      const delRec = await tx.recurringTransaction.deleteMany({ where: { userId } })
      const delBudget = await tx.budget.deleteMany({ where: { userId } })
      const delPayee = await tx.payee.deleteMany({ where: { userId } })

      // Payee.id é Int global sem autoincrement — o lock precisa estar DENTRO da
      // transação para o MAX+1 ser seguro contra execuções concorrentes.
      // i18n-ignore: string SQL bruta, não é texto de UI
      await tx.$executeRaw`LOCK TABLE payees IN EXCLUSIVE MODE`
      const maxPayee = await tx.payee.aggregate({ _max: { id: true } })
      const payeeIdBase = (maxPayee._max.id ?? 0) + 1

      const rows = materializeDataset(getDemoDataset(), {
        userId,
        prefix,
        accountIds,
        groupUuidByCode,
        groupCodeOffset,
        payeeIdBase,
        now: new Date(),
      })

      await tx.payee.createMany({ data: rows.payees })
      await tx.transaction.createMany({ data: rows.transactions })
      await tx.recurringTransaction.createMany({ data: rows.recurring })
      await tx.budget.createMany({ data: rows.budgets })
      for (const [accountId, balance] of Object.entries(rows.accountBalances)) {
        await tx.account.update({ where: { id: Number(accountId) }, data: { balance } })
      }

      return {
        prefix,
        deleted: {
          transactions: delTx.count,
          recurring: delRec.count,
          budgets: delBudget.count,
          payees: delPayee.count,
        },
        inserted: {
          payees: rows.payees.length,
          transactions: rows.transactions.length,
          recurring: rows.recurring.length,
          budgets: rows.budgets.length,
        },
        accountBalances: rows.accountBalances,
      }
    },
    { timeout: 120_000 }
  )
}
