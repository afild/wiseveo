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
import {
  defaultGroups,
  defaultCategories,
  defaultAccounts,
} from "../prisma/data/default-chart-of-accounts"

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

  await migrateNamesToEnglish()
}

/**
 * Tarefa 6B — a FONTE do universo WISEVEO passa a ser o inglês.
 *
 * Renomeia (apenas `name`; code/id/type/groupId ficam intactos) os statuses
 * globais, o plano de contas e as contas padrão que já existem na base demo.
 * Idempotente: pode rodar quantas vezes for preciso.
 */
async function migrateNamesToEnglish() {
  console.log("\n── Migração de nomes para inglês ──")

  // 1. Statuses globais (lookup compartilhado por toda a base demo).
  const STATUS_EN: Record<number, string> = {
    1: "Paid",
    2: "Pending",
    3: "Overdue",
    4: "Scheduled",
  }
  let statusCount = 0
  for (const [code, name] of Object.entries(STATUS_EN)) {
    const res = await prisma.transactionStatusLookup.updateMany({
      where: { code: Number(code) },
      data: { name },
    })
    statusCount += res.count
  }
  console.log(`Statuses renomeados: ${statusCount}`)

  // 2. Grupos do plano de contas.
  //    Usuários reais usam os codes originais (100–900). Phantoms usam
  //    1_000_000 + slotOffset + code, com slotOffset arbitrário por usuário —
  //    o offset não é persistido, então ele é reconstruído a partir do menor
  //    code do próprio usuário (o conjunto é base+100 … base+900).
  //    Se o conjunto do usuário não bater exatamente com os 9 defaults, o
  //    usuário é PULADO: melhor não renomear do que renomear errado.
  const groups = await prisma.categoryGroup.findMany({
    select: { id: true, code: true, userId: true, name: true },
  })
  const groupsByUser = new Map<string, typeof groups>()
  for (const g of groups) {
    const list = groupsByUser.get(g.userId) ?? []
    list.push(g)
    groupsByUser.set(g.userId, list)
  }

  const defaultGroupCodes = new Set(defaultGroups.map((g) => g.code))
  let groupCount = 0
  let groupSkippedUsers = 0
  for (const [userId, userGroups] of groupsByUser) {
    const isPhantom = userGroups.every((g) => g.code >= 1_000_000)
    const base = isPhantom
      ? Math.min(...userGroups.map((g) => g.code)) - 100
      : 0

    const normalized = userGroups.map((g) => ({ row: g, original: g.code - base }))
    const allKnown =
      normalized.length === defaultGroups.length &&
      new Set(normalized.map((n) => n.original)).size === defaultGroups.length &&
      normalized.every((n) => defaultGroupCodes.has(n.original))

    if (!allKnown) {
      groupSkippedUsers++
      continue
    }

    for (const { row, original } of normalized) {
      const seeded = defaultGroups.find((g) => g.code === original)
      if (!seeded || row.name === seeded.name) continue
      await prisma.categoryGroup.update({
        where: { id: row.id },
        data: { name: seeded.name },
      })
      groupCount++
    }
  }
  console.log(
    `Grupos renomeados: ${groupCount} (usuários pulados por conjunto irregular: ${groupSkippedUsers})`
  )

  // 3. Categorias — normalizadas pelos dois últimos segmentos do code
  //    ("ab12cd34.300.001" → "300.001"; "300.001" → "300.001").
  const categories = await prisma.category.findMany({
    select: { id: true, code: true, name: true },
  })
  let categoryCount = 0
  for (const cat of categories) {
    const parts = cat.code.split(".")
    const normalized = parts.slice(-2).join(".")
    const seeded = defaultCategories.find((c) => c.code === normalized)
    if (!seeded || cat.name === seeded.name) continue
    await prisma.category.update({
      where: { id: cat.id },
      data: { name: seeded.name },
    })
    categoryCount++
  }
  console.log(`Categorias renomeadas: ${categoryCount}`)

  // 4. Contas padrão — casadas por type.
  let accountCount = 0
  for (const acc of defaultAccounts) {
    const res = await prisma.account.updateMany({
      where: { type: acc.type, name: { not: acc.name } },
      data: { name: acc.name },
    })
    accountCount += res.count
  }
  console.log(`Contas renomeadas: ${accountCount}`)
}

main().finally(() => prisma.$disconnect())
