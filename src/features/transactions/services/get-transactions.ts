import { prisma } from "@/lib/prisma"
import { normalizeStatusName, type TransactionStatusKey } from "@/lib/paid-status"
import type { SerializedTransaction, TransactionFilterOptions } from "../types"
import { Prisma } from "@/generated/prisma_new/client"

interface GetTransactionsParams {
  userId: string
  from: Date
  to: Date
}

type TxStatus = TransactionStatusKey
type TxType = "INCOME" | "EXPENSE" | "TRANSFER"

function mapLegacyStatus(status: string | null): TxStatus {
  // Significado pelo NOME, com o critério único de src/lib/paid-status.ts (o
  // mesmo que rotula o formulário): nome fora do conjunto conhecido continua
  // aparecendo como pendente na tabela.
  return normalizeStatusName(status) ?? "PENDING"
}

function mapLegacyType(type: string | null): TxType {
  const key = (type ?? "").toUpperCase().trim()
  if (key === "INCOME" || key === "EXPENSE" || key === "TRANSFER") return key
  return "EXPENSE"
}

async function getAttachmentCountMap(transactionIds: string[]) {
  if (transactionIds.length === 0) return new Map<string, number>()

  const counts = await prisma.transactionAttachment.groupBy({
    by: ["transactionId"],
    where: { transactionId: { in: transactionIds } },
    _count: { _all: true },
  })

  return new Map(
    counts.map((item) => [item.transactionId, item._count._all])
  )
}

async function getMessageCountMap(transactionIds: string[]) {
  if (transactionIds.length === 0) return new Map<string, number>()

  try {
    const counts = await prisma.$queryRaw<
      Array<{
        transactionId: string
        total: number
      }>
    >`
      SELECT
        tm.transaction_id AS "transactionId",
        COUNT(*)::int AS total
      FROM public.transaction_messages tm
      WHERE tm.transaction_id IN (${Prisma.join(transactionIds)})
      GROUP BY tm.transaction_id
    `

    return new Map(
      counts.map((item) => [item.transactionId, Number(item.total)])
    )
  } catch {
    // Backward compatibility while the migration hasn't been applied yet.
    return new Map<string, number>()
  }
}

async function getTransactionsFromCurrentSchema({ userId, from, to }: GetTransactionsParams) {
  const [rawTransactions, accounts, categories] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        userId,
        date: { gte: from, lte: to },
      },
      orderBy: { date: "desc" },
      include: {
        account: { select: { id: true, name: true } },
        category: {
          select: {
            id: true,
            name: true,
            group: { select: { id: true, name: true } },
          },
        },
        payee: { select: { id: true, name: true } },
        statusLookup: { select: { name: true } },
        _count: { select: { attachments: true } },
      },
    }),
    prisma.account.findMany({
      where: { userId, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({
      where: { userId },
      select: { id: true, name: true, group: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
  ])

  const messageCountMap = await getMessageCountMap(
    rawTransactions.map((transaction) => transaction.id)
  )

  const transactions: SerializedTransaction[] = rawTransactions.map((t) => ({
    id: t.id,
    num: t.num ?? null,
    period: t.period,
    date: t.date.toISOString(),
    description: t.description,
    note: t.note,
    reference: t.reference,
    amount: Number(t.amount),
    type: t.type,
    status: mapLegacyStatus(t.statusLookup?.name ?? null),
    isExcluded: false,
    attachmentCount: t._count.attachments,
    messageCount: messageCountMap.get(t.id) ?? 0,
    account: {
      id: String(t.account.id),
      name: t.account.name,
    },
    category: {
      id: t.category.id,
      name: t.category.name,
      group: t.category.group,
    },
    payee: t.payee
      ? {
          id: String(t.payee.id),
          name: t.payee.name,
        }
      : null,
  }))

  const filterOptions: TransactionFilterOptions = {
    accounts: accounts.map((a) => ({ id: String(a.id), name: a.name })),
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      groupName: c.group.name,
    })),
    statuses: ["PAID", "PENDING", "OVERDUE", "SCHEDULED"],
    types: ["INCOME", "EXPENSE", "TRANSFER"],
  }

  return { transactions, filterOptions }
}

async function getTransactionsFromLegacySchema({ userId, from, to }: GetTransactionsParams) {
  const [rawTransactions, accounts, categories] = await Promise.all([
    prisma.$queryRaw<
      Array<{
        id: string
        num: number | null
        period: string
        date: Date
        description: string | null
        note: string | null
        reference: string | null
        amount: number
        type: string
        legacyStatus: string | null
        accountCode: number
        accountName: string
        categoryId: string
        categoryName: string
        groupId: string
        groupName: string
        payeeCode: number | null
        payeeName: string | null
      }>
    >`
      SELECT
        t.id,
        t."NUM" AS num,
        t."PERIODO" AS period,
        t."DATA" AS date,
        COALESCE(t."DESCRICAO", t."HISTORICO") AS description,
        t."HISTORICO" AS note,
        t."REF" AS reference,
        t."VALOR" AS amount,
        t."TIPO" AS type,
        ts."STATUS" AS "legacyStatus",
        a."COD_ACC" AS "accountCode",
        a."CONTA" AS "accountName",
        c.id AS "categoryId",
        c."CATEGORIA" AS "categoryName",
        g.id AS "groupId",
        g."GRUPO" AS "groupName",
        p."COD_BEN" AS "payeeCode",
        p."BENEFICIARIO" AS "payeeName"
      FROM public.transactions t
      INNER JOIN public.accounts a ON a."COD_ACC" = t."COD_ACC"
      INNER JOIN public.categories c ON c."COD_CAT" = t."COD_CAT"
      INNER JOIN public.category_groups g ON g.id = c.group_id
      LEFT JOIN public.payees p ON p."COD_BEN" = t."COD_BEN"
      LEFT JOIN public.transaction_statuses ts ON ts."COD_ST" = t."COD_ST"
      WHERE t.user_id = ${userId}
        AND t."DATA" >= ${from}
        AND t."DATA" <= ${to}
        AND NOT EXISTS (
          SELECT 1
          FROM public.excluded_transactions et
          WHERE et.id = t.id
        )
      ORDER BY t."DATA" DESC
    `,
    prisma.$queryRaw<
      Array<{
        codAcc: number
        name: string
      }>
    >`
      SELECT
        a."COD_ACC" AS "codAcc",
        a."CONTA" AS name
      FROM public.accounts a
      WHERE a.user_id = ${userId}
        AND a.active = true
      ORDER BY a."CONTA" ASC
    `,
    prisma.$queryRaw<
      Array<{
        id: string
        name: string
        groupName: string
      }>
    >`
      SELECT
        c.id,
        c."CATEGORIA" AS name,
        g."GRUPO" AS "groupName"
      FROM public.categories c
      INNER JOIN public.category_groups g ON g.id = c.group_id
      WHERE c.user_id = ${userId}
      ORDER BY c."CATEGORIA" ASC
    `,
  ])

  const transactions: SerializedTransaction[] = rawTransactions.map((t) => ({
    id: t.id,
    num: t.num ?? null,
    period: t.period,
    date: new Date(t.date).toISOString(),
    description: t.description,
    note: t.note,
    reference: t.reference,
    amount: Number(t.amount),
    type: mapLegacyType(t.type),
    status: mapLegacyStatus(t.legacyStatus),
    isExcluded: false,
    attachmentCount: 0,
    messageCount: 0,
    account: {
      id: String(t.accountCode),
      name: t.accountName,
    },
    category: {
      id: t.categoryId,
      name: t.categoryName,
      group: {
        id: t.groupId,
        name: t.groupName,
      },
    },
    payee: t.payeeCode && t.payeeName ? { id: String(t.payeeCode), name: t.payeeName } : null,
  }))

  const transactionIds = rawTransactions.map((t) => t.id)
  const [attachmentCountMap, messageCountMap] = await Promise.all([
    getAttachmentCountMap(transactionIds),
    getMessageCountMap(transactionIds),
  ])

  const transactionsWithAttachments: SerializedTransaction[] = transactions.map((t) => ({
    id: t.id,
    num: t.num,
    period: t.period,
    date: t.date,
    description: t.description,
    note: t.note,
    reference: t.reference,
    amount: t.amount,
    type: t.type,
    status: t.status,
    isExcluded: t.isExcluded,
    attachmentCount: attachmentCountMap.get(t.id) ?? 0,
    messageCount: messageCountMap.get(t.id) ?? 0,
    account: t.account,
    category: t.category,
    payee: t.payee,
  }))

  const filterOptions: TransactionFilterOptions = {
    accounts: accounts.map((a) => ({ id: String(a.codAcc), name: a.name })),
    categories,
    statuses: ["PAID", "PENDING", "OVERDUE", "SCHEDULED"],
    types: ["INCOME", "EXPENSE", "TRANSFER"],
  }

  return { transactions: transactionsWithAttachments, filterOptions }
}

export async function getTransactions({ userId, from, to }: GetTransactionsParams) {
  try {
    return await getTransactionsFromCurrentSchema({ userId, from, to })
  } catch {
    return getTransactionsFromLegacySchema({ userId, from, to })
  }
}
