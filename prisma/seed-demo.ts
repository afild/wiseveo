/**
 * seed-demo.ts — cria/atualiza o usuário demo PERMANENTE (demo@wiseveo.com) e
 * regenera o dataset determinístico dele.
 *
 * Diferente dos phantoms (/api/demo/provision), este usuário é fixo e tem senha.
 * O plano de contas dele é PREFIXADO (prefixo fixo `de305eed`), igual ao de um
 * phantom: assim ele fica isolado e o script NUNCA precisa do caminho sem-prefixo
 * de initializeUserData — que faria upsert dos códigos GLOBAIS compartilhados
 * (CategoryGroup 100–900, Category "100.001"…, Account 1–3) e, pior, roubaria a
 * posse dos TransactionStatusLookup 1–4, hoje ancorados em dev@wiseveo.local para
 * o cron de limpeza continuar funcionando.
 *
 * O miolo (apagar → materializar → inserir) mora em src/lib/demo-data/regen.ts,
 * compartilhado com scripts/regen-demo-user.ts.
 *
 * Uso:
 *   SEED_DEMO_PASSWORD=... npm run db:seed:demo
 */
import { PrismaClient } from "../src/generated/prisma_new/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import bcrypt from "bcryptjs"
import { initializeUserData } from "../src/lib/user-init"
import { getDemoDataset } from "../src/lib/demo-data/generate-demo-dataset"
import { regenerateUserDemoData } from "../src/lib/demo-data/regen"
import { resolveDemoDatabaseUrl } from "../scripts/demo-db-guard"
import { DEMO_DEFAULT_LOCALE } from "../src/i18n/config"
import { demoMonetarySettings } from "../src/lib/monetary"
import { DEMO_DISPLAY_NAME } from "../src/lib/demo-identity"
import { computeDemoClosedThrough } from "../src/lib/demo-data/demo-closing"
import { unpaidStatusFilter } from "../src/lib/paid-status"
import {
  mergeUserPreferenceKey,
  writeUserPreferenceKeys,
} from "../src/features/settings/services/user-preferences-write"

/** Prefixo fixo do usuário demo permanente — nunca muda (o dataset é regenerado sobre ele). */
const DEMO_USER_PREFIX = "de305eed"

const url = resolveDemoDatabaseUrl()

const pool = new Pool({ connectionString: url })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log("Start seeding demo database...")

  const email = process.env.SEED_DEMO_EMAIL?.trim().toLowerCase() || "demo@wiseveo.com"
  const password = process.env.SEED_DEMO_PASSWORD
  if (!password) {
    throw new Error(
      "SEED_DEMO_PASSWORD is required. Set it in your environment before seeding."
    )
  }
  const hashedPassword = await bcrypt.hash(password, 10)

  // 1. Criar/atualizar o usuário demo
  // Sem preferencesJson aqui, a vitrine cai no locale/moeda padrão da instalação (pt-BR/BRL)
  // enquanto os phantoms nascem em en-US/USD (provisionDemoVisitor) — bug encontrado em
  // 31/08: a vitrine renderizava números em pt-BR (10.909,20) e as cópias em en-US (10,909.20).
  // Só no `create`: no `update`, regravar o objeto inteiro apagaria o fechamento de datas e o PIN
  // da vitrine (re-semear é rotina; perder o corte, não). A partir do passo 4 tudo entra por CHAVE.
  const preferencesJson = { locale: DEMO_DEFAULT_LOCALE, monetary: { ...demoMonetarySettings } }
  // Licença de escrita na vitrine: o UPDATE do upsert cai no gatilho de `users`
  // (prisma/demo/vitrine-guard.sql) num banco que já tem os gatilhos. Sem a
  // licença, re-semear a vitrine seria RECUSADO. Transaction-local.
  const demoUser = await prisma.$transaction(async (tx) => {
    // i18n-ignore: comando SQL, não é texto de UI
    await tx.$executeRaw`SELECT set_config('wiseveo.vitrine_write', 'on', true)`
    return tx.user.upsert({
      where: { email },
      update: {
        name: DEMO_DISPLAY_NAME,
        passwordHash: hashedPassword,
        role: "USER",
        status: "ACTIVE",
      },
      create: {
        name: DEMO_DISPLAY_NAME,
        email,
        passwordHash: hashedPassword,
        role: "USER",
        status: "ACTIVE",
        preferencesJson,
      },
    })
  })
  console.log(`Usuário demo criado/atualizado: ${demoUser.email} (${demoUser.id})`)

  // 2. Plano de contas — só na PRIMEIRA execução, e SEMPRE com prefixo.
  const existingGroups = await prisma.categoryGroup.count({ where: { userId: demoUser.id } })
  if (existingGroups === 0) {
    console.log(`Sem plano de contas — inicializando com prefixo ${DEMO_USER_PREFIX}...`)
    await initializeUserData(prisma, demoUser.id, DEMO_USER_PREFIX)
  } else {
    console.log(`Plano de contas já existe (${existingGroups} grupos) — inicialização pulada.`)
  }

  // 3. Dataset determinístico (wipe-and-replace transacional, só por userId)
  const result = await regenerateUserDemoData(prisma, demoUser.id)

  // 4. Preferências da vitrine, sempre por CHAVE (nunca o objeto inteiro).
  //    O corte de fechamento só pode ser calculado AQUI, com o dataset já no banco: é o dia
  //    anterior ao não pago mais antigo, para os dois vencidos de demonstração continuarem
  //    pagáveis sem PIN. "Não pago" pelo NOME do status (unpaidStatusFilter), nunca pelo código.
  const unpaidDates = await prisma.transaction.findMany({
    where: { userId: demoUser.id, ...unpaidStatusFilter() },
    select: { date: true },
  })
  // Licença de escrita na vitrine: os três writes abaixo caem no gatilho de `users`
  // (prisma/demo/vitrine-guard.sql) e sem o set_config o banco recusa com P0403.
  await prisma.$transaction(async (tx) => {
    // i18n-ignore: comando SQL, não é texto de UI
    await tx.$executeRaw`SELECT set_config('wiseveo.vitrine_write', 'on', true)`
    await writeUserPreferenceKeys(tx, demoUser.id, [
      { key: "locale", value: DEMO_DEFAULT_LOCALE },
      { key: "monetary", value: { ...demoMonetarySettings } },
    ])
    await mergeUserPreferenceKey(tx, demoUser.id, "dateClosing", {
      closedThrough: computeDemoClosedThrough(
        unpaidDates.map((t) => t.date),
        new Date()
      ),
    })
  })

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
  console.log(
    `Demo database seeding completed — ${getDemoDataset().transactions.length} transações no dataset.`
  )
}

main()
  .catch((e) => {
    console.error("Error during demo database seeding:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
