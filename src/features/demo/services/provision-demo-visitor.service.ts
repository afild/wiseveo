import crypto from "crypto"
import { prisma } from "@/lib/prisma"
import { initializeUserData } from "@/lib/user-init"
import { getDemoDataset } from "@/lib/demo-data/generate-demo-dataset"
import { materializeDataset } from "@/lib/demo-data/materialize"
import { DEMO_DEFAULT_LOCALE } from "@/i18n/config"
import { demoMonetarySettings } from "@/lib/monetary"
import { DEMO_DISPLAY_NAME } from "@/lib/demo-identity"
import { computeDemoClosedThrough } from "@/lib/demo-data/demo-closing"
import { isPaidStatusName } from "@/lib/paid-status"
import { mergeUserPreferenceKey } from "@/features/settings/services/user-preferences-write"

/**
 * Cria UM visitante da demo com o conjunto completo (~2.647 linhas) numa única
 * transação. Contrato para quem chama:
 * - Serializa: pega LOCK EXCLUSIVE em `payees` — dois provisionamentos
 *   concorrentes viram fila (o MAX+1 do id de payee depende disso).
 * - Custa até 55s: a rota chamadora precisa de `export const maxDuration = 60`.
 * - Não assina sessão nem grava cookies (sessão/idioma/fresh-session são do
 *   chamador).
 * - Lança Error cru (mensagem interna, nunca exibida): trate no chamador.
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
        name: DEMO_DISPLAY_NAME, // D6: nome de exibição único da marca (também usado como nome real deste phantom — não há UI que edite o nome de um visitante demo)
        email: `${userId}@wiseveo.demo`,
        status: "ACTIVE",
        role: "USER",
        // Demo nasce em inglês (mesmo valor que o chamador grava no cookie de idioma —
        // ver src/app/api/demo/provision/route.ts — para getUserLocale concordar) e em
        // dólar (Configurações → Moeda; a UI lê de /api/user/monetary-preferences).
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

    // 8. Corte de fechamento inicial — só agora, com as linhas já criadas, dá para saber qual é o
    //    não pago mais antigo. Vai DENTRO desta transação (nunca no `user.create` do passo 1):
    //    a cópia nasce inteira ou não nasce.
    //
    //    O nome do status vem do lookup, nunca do código: `isPaidStatusName` é a regra ÚNICA do
    //    sistema. A busca é por CÓDIGO e não por `userId` porque `TransactionStatusLookup.code` é
    //    `@unique` GLOBAL — as quatro linhas são compartilhadas e o `userId` delas é só o dono de
    //    referência (o `upsert` de initializeUserData para phantom traz `update: {}`, de propósito).
    //    Filtrar pelo id do visitante devolveria vazio, TODA linha viraria "não pago" e o corte
    //    desabaria para o dia anterior ao primeiro lançamento do dataset.
    const usedStatusCodes = [...new Set(rows.transactions.map((t) => t.statusCode))]
    const nameByCode = Object.fromEntries(
      (
        await tx.transactionStatusLookup.findMany({
          where: { code: { in: usedStatusCodes } },
          select: { code: true, name: true },
        })
      ).map((s) => [s.code, s.name]),
    )
    const unpaid = rows.transactions
      .filter((t) => !isPaidStatusName(nameByCode[t.statusCode]))
      .map((t) => t.date)
    await mergeUserPreferenceKey(tx, userId, "dateClosing", {
      closedThrough: computeDemoClosedThrough(unpaid, new Date()),
      pinHash: null,
    })
  }, {
    timeout: 55_000, // 55s (below Vercel's 60s maxDuration)
  })

  return { userId }
}
