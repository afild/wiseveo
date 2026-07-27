/**
 * regen-demo-user.ts — wipe-and-replace transacional do dataset determinístico
 * para UM usuário JÁ EXISTENTE, identificado por e-mail.
 *
 * Usado para atualizar o usuário dev local (dev@wiseveo.local) com o dataset novo,
 * sem precisar reprovisionar um phantom. NÃO cria usuários e NÃO mexe no plano de
 * contas (reaproveita o que o usuário já tem, prefixado).
 *
 * Apaga (somente por userId): transactions, recurring_transactions, budgets, payees.
 * Recria tudo a partir de materializeDataset(getDemoDataset(), ...), reaproveitando
 * accounts/categoryGroups/categories existentes do usuário.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/regen-demo-user.ts dev@wiseveo.local
 *   (ou: npm run demo:regen -- dev@wiseveo.local)
 */
import { PrismaClient } from "../src/generated/prisma_new/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import { getDemoDataset } from "../src/lib/demo-data/generate-demo-dataset"
import { materializeDataset } from "../src/lib/demo-data/materialize"

const url = process.env.DATABASE_URL ?? ""
if (!url.includes("DEMO_DB_REF_PLACEHOLDER")) {
  console.error("ABORT: DATABASE_URL não é a base DEMO.")
  process.exit(1)
}
const email = process.argv[2]
if (!email) {
  console.error("uso: npx tsx --env-file=.env.local scripts/regen-demo-user.ts <email>")
  process.exit(1)
}

const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) })

async function main() {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) throw new Error(`Usuário ${email} não existe — este script NÃO cria usuários.`)

  const accounts = await prisma.account.findMany({ where: { userId: user.id } })
  const groups = await prisma.categoryGroup.findMany({ where: { userId: user.id } })
  const cats = await prisma.category.findMany({ where: { userId: user.id }, take: 1 })
  if (!accounts.length || !groups.length || !cats.length) {
    throw new Error("Usuário sem plano de contas prefixado.")
  }
  const prefix = cats[0].code.split(".")[0]
  if (prefix.length < 6) {
    throw new Error(`Categoria sem prefixo (${cats[0].code}) — usuário NÃO isolado; abortando.`)
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

  const expectedGroupCodes = [100, 200, 300, 400, 500, 600, 700, 800, 900]
  if (
    groups.length !== expectedGroupCodes.length ||
    expectedGroupCodes.some((code) => !groupUuidByCode[code])
  ) {
    throw new Error("regen-demo-user: conjunto de grupos de categoria inesperado para este usuário.")
  }

  // Contagens ANTES de apagar — para o controller conferir sem precisar de queries extras.
  const [beforeTx, beforeRec, beforeBudget, beforePayee] = await Promise.all([
    prisma.transaction.count({ where: { userId: user.id } }),
    prisma.recurringTransaction.count({ where: { userId: user.id } }),
    prisma.budget.count({ where: { userId: user.id } }),
    prisma.payee.count({ where: { userId: user.id } }),
  ])
  console.log(
    `Usuário: ${email} (${user.id}) — prefixo ${prefix}\n` +
      `Será apagado — transactions: ${beforeTx}, recurring: ${beforeRec}, budgets: ${beforeBudget}, payees: ${beforePayee}`
  )

  const result = await prisma.$transaction(async (tx) => {
    // Ordem respeita FKs: transactions (referencia payeeId) antes de payees.
    const delTx = await tx.transaction.deleteMany({ where: { userId: user.id } })
    const delRec = await tx.recurringTransaction.deleteMany({ where: { userId: user.id } })
    const delBudget = await tx.budget.deleteMany({ where: { userId: user.id } })
    const delPayee = await tx.payee.deleteMany({ where: { userId: user.id } })

    // Payee.id é Int global sem autoincrement — lock precisa estar DENTRO da
    // transação para o MAX+1 ser seguro contra execuções concorrentes.
    // i18n-ignore: string SQL bruta, não é texto de UI
    await tx.$executeRaw`LOCK TABLE payees IN EXCLUSIVE MODE`
    const maxPayee = await tx.payee.aggregate({ _max: { id: true } })
    const payeeIdBase = (maxPayee._max.id ?? 0) + 1

    const rows = materializeDataset(getDemoDataset(), {
      userId: user.id,
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
      deleted: { transactions: delTx.count, recurring: delRec.count, budgets: delBudget.count, payees: delPayee.count },
      inserted: {
        payees: rows.payees.length,
        transactions: rows.transactions.length,
        recurring: rows.recurring.length,
        budgets: rows.budgets.length,
      },
      accountBalances: rows.accountBalances,
    }
  }, { timeout: 120_000 })

  console.log(
    `Apagado — transactions: ${result.deleted.transactions}, recurring: ${result.deleted.recurring}, ` +
      `budgets: ${result.deleted.budgets}, payees: ${result.deleted.payees}`
  )
  console.log(
    `Inserido — payees: ${result.inserted.payees}, transactions: ${result.inserted.transactions}, ` +
      `recurring: ${result.inserted.recurring}, budgets: ${result.inserted.budgets}`
  )
  console.log(`Saldos de conta: ${JSON.stringify(result.accountBalances)}`)
  console.log(`Regenerado: ${email} — ${getDemoDataset().transactions.length} transações no dataset.`)
}

main()
  .catch((error) => {
    console.error("Falha ao regenerar usuário:", error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
