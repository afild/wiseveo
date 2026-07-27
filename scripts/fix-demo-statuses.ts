/**
 * fix-demo-statuses.ts — reatribui o dono dos statuses 1-4 a um usuário
 * permanente (dev@wiseveo.local) e purga phantoms antigos em lotes.
 *
 * O bug: TransactionStatusLookup (códigos 1-4) é um lookup GLOBAL compartilhado,
 * mas initializeUserData grava o userId de quem criou primeiro — o phantom mais
 * antigo. User→transactionStatuses é Cascade e Transaction→statusLookup é
 * Restrict (default do Prisma) → apagar o dono derruba o cascade, que tenta
 * apagar os statuses 1-4, que ainda são referenciados pelas transactions de
 * TODOS os outros usuários → Restrict rejeita → o cron nunca apaga nada.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/fix-demo-statuses.ts
 */
import { PrismaClient } from "../src/generated/prisma_new/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const url = process.env.DATABASE_URL ?? ""
if (!url.includes("DEMO_DB_REF_PLACEHOLDER")) {
  console.error("ABORT: DATABASE_URL não é a base DEMO.")
  process.exit(1)
}
const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) })

async function main() {
  const anchor = await prisma.user.findFirst({ where: { email: "dev@wiseveo.local" } })
  if (!anchor) throw new Error("Usuário âncora dev@wiseveo.local não encontrado.")

  const moved = await prisma.transactionStatusLookup.updateMany({
    where: { code: { in: [1, 2, 3, 4] } },
    data: { userId: anchor.id },
  })
  console.log(`Statuses reatribuídos a ${anchor.email}: ${moved.count}`)

  const stale = await prisma.user.findMany({
    where: {
      email: { startsWith: "demo_" },
      createdAt: { lt: new Date(Date.now() - 25 * 3600_000) },
    },
    select: { id: true },
    take: 500,
  })
  console.log(`Phantoms encontrados para purga: ${stale.length}`)

  let ok = 0
  let fail = 0
  for (const u of stale) {
    try {
      await prisma.user.delete({ where: { id: u.id } })
      ok++
    } catch (e) {
      fail++
      console.error(`Falha ao apagar ${u.id}:`, (e as Error).message)
    }
    const processed = ok + fail
    if (processed % 25 === 0) {
      console.log(`Progresso: ${processed}/${stale.length} (ok=${ok}, falhas=${fail})`)
    }
  }
  console.log(`Phantoms purgados: ${ok}; falhas: ${fail}`)
}

main().finally(() => prisma.$disconnect())
