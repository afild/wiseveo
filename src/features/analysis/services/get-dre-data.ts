import { getTranslations } from "next-intl/server"

import { prisma } from "@/lib/prisma"
import { periodFromDate } from "@/lib/financial"
import type { AppLocale } from "@/i18n/config"
import { resolveCategoryLabel, resolveGroupLabel } from "@/i18n/chart-labels"
import type { DreData, DreLineItem } from "../types"

interface AggregateBucket {
  groupCode: string
  groupName: string
  amount: number
  transactionCount: number
}

function normalizeGroupName(
  name: string | null | undefined,
  fallback: string,
): string {
  const trimmed = name?.trim()

  if (!trimmed) return fallback
  if (trimmed.toLowerCase() === "outros") return "OUTROS"

  return trimmed
}

function normalizeCategoryName(
  name: string | null | undefined,
  fallback: string,
): string {
  const trimmed = name?.trim()

  if (!trimmed) return fallback
  if (trimmed.toLowerCase() === "outros") return "OUTROS"

  return trimmed
}

function buildTransferBucketName(groupName: string, categoryName: string): string {
  if (groupName === categoryName) return groupName
  return `${groupName} · ${categoryName}`
}

function toSortedLineItems(
  buckets: Map<string, AggregateBucket>,
  total: number,
): DreLineItem[] {
  return Array.from(buckets.values())
    .map((bucket) => ({
      groupCode: bucket.groupCode,
      groupName: bucket.groupName,
      amount: bucket.amount,
      percentage: total > 0 ? (bucket.amount / total) * 100 : 0,
      transactionCount: bucket.transactionCount,
    }))
    .sort((a, b) => b.amount - a.amount)
}

function getInclusivePeriodDays(from: Date, to: Date): number {
  const millisecondsPerDay = 1000 * 60 * 60 * 24
  return Math.max(1, Math.floor((to.getTime() - from.getTime()) / millisecondsPerDay) + 1)
}

export async function getDreData(
  userId: string,
  from: Date,
  to: Date,
  locale?: AppLocale,
): Promise<DreData> {
  // Telegram passes the user's persisted locale explicitly (no request cookie
  // available there); web callers omit it and keep resolving from the cookie.
  const t = locale
    ? await getTranslations({ locale, namespace: "analysis.fallback" })
    : await getTranslations("analysis.fallback")
  // Raiz do next-intl: os helpers de rotulo do plano de contas usam a chave completa.
  const tRoot = locale ? await getTranslations({ locale }) : await getTranslations()

  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      period: {
        gte: periodFromDate(from),
        lte: periodFromDate(to),
      },
      type: {
        in: ["INCOME", "EXPENSE", "TRANSFER"],
      },
    },
    select: {
      amount: true,
      type: true,
      groupCode: true,
      categoryCode: true,
      group: {
        select: {
          code: true,
          name: true,
        },
      },
      category: {
        select: {
          code: true,
          name: true,
        },
      },
    },
  })

  const incomeBuckets = new Map<string, AggregateBucket>()
  const expenseBuckets = new Map<string, AggregateBucket>()
  const transferInBuckets = new Map<string, AggregateBucket>()
  const transferOutBuckets = new Map<string, AggregateBucket>()

  for (const transaction of transactions) {
    const amount = Number(transaction.amount ?? 0)

    if (transaction.type === "TRANSFER") {
      const isIncoming = amount >= 0
      const targetBuckets = isIncoming ? transferInBuckets : transferOutBuckets
      const groupCode = String(transaction.group?.code ?? transaction.groupCode ?? 0)
      const categoryCode = transaction.category?.code ?? transaction.categoryCode ?? "TRANSFER"
      const bucketCode = `${groupCode}:${categoryCode}`
      const groupName = resolveGroupLabel(tRoot, {
        name: normalizeGroupName(transaction.group?.name, t("transferGroup")),
      })
      const categoryName = resolveCategoryLabel(tRoot, {
        code: transaction.category?.code,
        name: normalizeCategoryName(transaction.category?.name, t("transferCategory")),
      })
      const bucketName = buildTransferBucketName(groupName, categoryName)
      const absoluteAmount = Math.abs(amount)
      const existing = targetBuckets.get(bucketCode)

      if (existing) {
        existing.amount += absoluteAmount
        existing.transactionCount += 1
      } else {
        targetBuckets.set(bucketCode, {
          groupCode: bucketCode,
          groupName: bucketName,
          amount: absoluteAmount,
          transactionCount: 1,
        })
      }

      continue
    }

    const isIncome = transaction.type === "INCOME"
    const targetBuckets = isIncome ? incomeBuckets : expenseBuckets
    const groupCode = String(transaction.group?.code ?? transaction.groupCode ?? 0)
    const groupName = resolveGroupLabel(tRoot, {
      name: normalizeGroupName(
        transaction.group?.name,
        isIncome ? t("incomeGroup") : t("expenseGroup"),
      ),
    })
    const existing = targetBuckets.get(groupCode)
    const absoluteAmount = Math.abs(amount)

    if (existing) {
      existing.amount += absoluteAmount
      existing.transactionCount += 1
      continue
    }

    targetBuckets.set(groupCode, {
      groupCode,
      groupName,
      amount: absoluteAmount,
      transactionCount: 1,
    })
  }

  const income = Array.from(incomeBuckets.values()).reduce(
    (sum, bucket) => sum + bucket.amount,
    0,
  )
  const expense = Array.from(expenseBuckets.values()).reduce(
    (sum, bucket) => sum + bucket.amount,
    0,
  )
  const transferIn = Array.from(transferInBuckets.values()).reduce(
    (sum, bucket) => sum + bucket.amount,
    0,
  )
  const transferOut = Array.from(transferOutBuckets.values()).reduce(
    (sum, bucket) => sum + bucket.amount,
    0,
  )
  const operationalNet = income - expense
  const net = operationalNet + transferIn - transferOut
  const periodDays = getInclusivePeriodDays(from, to)

  const incomeGroups = toSortedLineItems(incomeBuckets, income)
  const expenseGroups = toSortedLineItems(expenseBuckets, expense)
  const transferInGroups = toSortedLineItems(transferInBuckets, transferIn)
  const transferOutGroups = toSortedLineItems(transferOutBuckets, transferOut)

  return {
    summary: {
      income,
      expense,
      transferIn,
      transferOut,
      operationalNet,
      net,
      marginPercentage: income > 0 ? (operationalNet / income) * 100 : null,
      transactionCount: transactions.length,
      incomeGroupCount: incomeGroups.length,
      expenseGroupCount: expenseGroups.length,
      transferInGroupCount: transferInGroups.length,
      transferOutGroupCount: transferOutGroups.length,
      averageDailyNet: net / periodDays,
    },
    incomeGroups,
    expenseGroups,
    transferInGroups,
    transferOutGroups,
    topIncomeGroup: incomeGroups[0] ?? null,
    topExpenseGroup: expenseGroups[0] ?? null,
    topTransferInGroup: transferInGroups[0] ?? null,
    topTransferOutGroup: transferOutGroups[0] ?? null,
    periodDays,
  }
}
