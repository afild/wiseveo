import crypto from "crypto"
import { prisma } from "@/lib/prisma"
import { initializeUserData } from "@/lib/user-init"
import { getDemoDataset } from "@/lib/demo-data/generate-demo-dataset"
import { materializeDataset } from "@/lib/demo-data/materialize"
import { DEMO_DEFAULT_LOCALE } from "@/i18n/config"
import { demoMonetarySettings } from "@/lib/monetary"

/**
 * Cria UM visitante da demo com o conjunto completo (~2.647 linhas), numa
 * transação só. É o antigo miolo de /api/demo/provision, movido para cá para
 * ser usado tanto pelo fork (caminho normal) quanto pela entrada, como
 * reserva, se a vitrine não existir.
 */
export async function provisionDemoVisitor(): Promise<{ userId: string }> {
  const demoId = crypto.randomUUID()
  // Short prefix: 8 hex chars from the UUID (without hyphens)
  const userPrefix = demoId.replace(/-/g, "").slice(0, 8)
  const userId = `demo_${demoId}`

  // All provisioning in a single Prisma transaction for atomicity and performance
  await prisma.$transaction(async (tx) => {
    // 1. Create phantom user
    await tx.user.create({
      data: {
        id: userId,
        name: "Demo Visitor", // i18n-ignore: nome padrão do usuário demo provisionado automaticamente — dado semente, não copy de UI
        email: `${userId}@wiseveo.demo`,
        status: "ACTIVE",
        role: "USER",
        // Demo nasce em inglês (mesmo valor gravado no cookie abaixo, para getUserLocale
        // concordar) e em dólar (Configurações → Moeda; a UI lê de /api/user/monetary-preferences).
        preferencesJson: { locale: DEMO_DEFAULT_LOCALE, monetary: { ...demoMonetarySettings } },
      },
    })

    // 2. Initialize Chart of Accounts — isolated codes per phantom user
    const accountIds = await initializeUserData(tx, userId, userPrefix)
    const checkingAccountId = accountIds["CHECKING"]

    if (!checkingAccountId) {
      // i18n-ignore: mensagem interna de Error, só logada (console.error), nunca exibida ao usuário
      throw new Error("Failed to resolve checking account ID for demo user")
    }

    // 3. Recuperar os grupos recém-criados e reconstruir o offset do phantom.
    //    user-init.ts monta `phantomCode = 1_000_000 + slotOffset + originalCode`, com
    //    slotOffset arbitrário (derivado do prefixo). NÃO dá para usar `code % 1000`:
    //    isso só devolveria o originalCode quando slotOffset fosse múltiplo de 1000.
    //    Como o conjunto é sempre base+100 … base+900, o offset é `min(code) - 100`.
    const groups: Array<{ id: string; code: number }> = await tx.categoryGroup.findMany({
      where: { userId },
      select: { id: true, code: true },
    })
    const groupCodeOffset = Math.min(...groups.map((g) => g.code)) - 100
    const groupUuidByCode: Record<number, string> = {}
    for (const g of groups) groupUuidByCode[g.code - groupCodeOffset] = g.id

    const expectedGroupCodes = [100, 200, 300, 400, 500, 600, 700, 800, 900]
    if (
      groups.length !== expectedGroupCodes.length ||
      expectedGroupCodes.some((code) => !groupUuidByCode[code])
    ) {
      // i18n-ignore: mensagem interna de Error, só logada (console.error), nunca exibida ao usuário
      throw new Error("Demo provisioning: unexpected category group set for phantom user")
    }

    // 4. Reservar um bloco de ids de payee (Payee.id é Int global, sem autoincrement).
    //    O lock precisa acontecer DENTRO desta transação para o MAX+1 ser seguro
    //    contra provisionamentos concorrentes.
    // i18n-ignore: string SQL bruta, não é texto de UI
    await tx.$executeRaw`LOCK TABLE payees IN EXCLUSIVE MODE`
    const maxPayee = await tx.payee.aggregate({ _max: { id: true } })
    const payeeIdBase = (maxPayee._max.id ?? 0) + 1

    // 5. Materializar o dataset determinístico no namespace deste usuário
    const rows = materializeDataset(getDemoDataset(), {
      userId,
      prefix: userPrefix,
      accountIds,
      groupUuidByCode,
      groupCodeOffset,
      payeeIdBase,
      now: new Date(),
    })

    // 6. Bulk insert — ordem respeita as FKs (payees antes de transactions/recurring)
    await tx.payee.createMany({ data: rows.payees })
    await tx.transaction.createMany({ data: rows.transactions })
    await tx.recurringTransaction.createMany({ data: rows.recurring })
    await tx.budget.createMany({ data: rows.budgets })

    // 7. Saldos iniciais das contas
    for (const [accountId, balance] of Object.entries(rows.accountBalances)) {
      if (balance !== 0) {
        await tx.account.update({ where: { id: Number(accountId) }, data: { balance } })
      }
    }
  }, {
    timeout: 55_000, // 55s (below Vercel's 60s maxDuration)
  })

  return { userId }
}
