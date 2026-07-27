/**
 * regen-demo-user.ts — wipe-and-replace transacional do dataset determinístico
 * para UM usuário JÁ EXISTENTE, identificado por e-mail.
 *
 * Usado para atualizar o usuário dev local (dev@wiseveo.local) com o dataset novo,
 * sem precisar reprovisionar um phantom. NÃO cria usuários e NÃO mexe no plano de
 * contas (reaproveita o que o usuário já tem, prefixado).
 *
 * O miolo (resolver namespace → apagar → materializar → inserir) mora em
 * src/lib/demo-data/regen.ts, compartilhado com prisma/seed-demo.ts.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/regen-demo-user.ts dev@wiseveo.local
 *   (ou: npm run demo:regen -- dev@wiseveo.local)
 */
import { PrismaClient } from "../src/generated/prisma_new/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import { getDemoDataset } from "../src/lib/demo-data/generate-demo-dataset"
import { regenerateUserDemoData } from "../src/lib/demo-data/regen"

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

  // Contagens ANTES de apagar — para o controller conferir sem precisar de queries extras.
  const [beforeTx, beforeRec, beforeBudget, beforePayee] = await Promise.all([
    prisma.transaction.count({ where: { userId: user.id } }),
    prisma.recurringTransaction.count({ where: { userId: user.id } }),
    prisma.budget.count({ where: { userId: user.id } }),
    prisma.payee.count({ where: { userId: user.id } }),
  ])
  console.log(
    `Usuário: ${email} (${user.id})\n` +
      `Será apagado — transactions: ${beforeTx}, recurring: ${beforeRec}, budgets: ${beforeBudget}, payees: ${beforePayee}`
  )

  const result = await regenerateUserDemoData(prisma, user.id)

  console.log(`Prefixo do plano de contas: ${result.prefix}`)
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
