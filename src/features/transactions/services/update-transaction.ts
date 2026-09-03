import { prisma } from "@/lib/prisma"
import { normalizeDate, isValidPeriod } from "@/lib/financial"
import { dayKeyOfStored } from "@/features/security/lib/date-closing"
import { assertWritable } from "@/features/security/services/date-closing.service"
import type { WriteContext } from "@/features/security/services/write-context"

interface UpdateTransactionInput {
  id: string
  userId: string
  date: string
  period?: string
  reference?: string
  note?: string
  description?: string
  amount: number
  type: "INCOME" | "EXPENSE" | "TRANSFER"
  accountId: number
  groupCode: number
  categoryCode: string
  statusCode: number
  payeeId?: number
  payeeName?: string
  destAccountId?: number
}

async function resolvePayeeId(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: string,
  payeeId?: number,
  payeeName?: string
): Promise<number | null> {
  if (payeeId) {
    const existing = await tx.payee.findFirst({
      where: { id: payeeId, userId },
      select: { id: true },
    })
    if (existing) return existing.id
  }

  const trimmed = payeeName?.trim()
  if (!trimmed) return payeeId ?? null

  const existingByName = await tx.payee.findFirst({
    where: {
      userId,
      name: { equals: trimmed, mode: "insensitive" },
    },
    select: { id: true },
  })
  if (existingByName) return existingByName.id

  const nextIdResult = await tx.$queryRaw<Array<{ next_id: number }>>`
    SELECT COALESCE(MAX("COD_BEN"), 0) + 1 AS next_id FROM payees
  `
  const nextPayeeId = Number(nextIdResult[0]?.next_id ?? 1)

  const created = await tx.payee.create({
    data: { id: nextPayeeId, name: trimmed, userId },
    select: { id: true },
  })
  return created.id
}

export async function updateTransaction(
  input: UpdateTransactionInput,
  ctx: WriteContext
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.transaction.findFirst({
      where: {
        id: input.id,
        userId: input.userId,
      },
      select: { id: true, date: true, period: true },
    })

    if (!existing) {
      return null
    }

    // Os dois lados da mudança contam: de onde o lançamento sai e para onde ele vai.
    const storedDate = normalizeDate(input.date)
    await assertWritable(tx, ctx, {
      days: [dayKeyOfStored(existing.date), dayKeyOfStored(storedDate)],
      periods: [existing.period, input.period],
    })

    // Sign determined by the category's actual type in the DB (not the tab type).
    const category = await tx.category.findUnique({
      where: { code: input.categoryCode },
      select: { type: true },
    })
    const effectiveType = category?.type ?? input.type

    const absAmount = Math.abs(input.amount)
    const finalAmount = effectiveType === "EXPENSE" ? -absAmount : absAmount

    const resolvedPayeeId = await resolvePayeeId(
      tx,
      input.userId,
      input.payeeId,
      input.payeeName
    )

    const transaction = await tx.transaction.update({
      where: { id: input.id },
      data: {
        date: storedDate,
        ...(input.period && isValidPeriod(input.period)
          ? { period: input.period }
          : {}),
        reference: input.reference?.trim() || null,
        note: input.note?.trim() || null,
        description: input.description?.trim() || null,
        amount: finalAmount,
        type: input.type,
        accountId: input.accountId,
        groupCode: input.groupCode,
        categoryCode: input.categoryCode,
        statusCode: input.statusCode,
        payeeId: resolvedPayeeId,
        destAccountId: input.destAccountId ?? null,
      },
    })

    return transaction
  })
}
