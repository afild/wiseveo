import { prisma } from "@/lib/prisma"
import { normalizeDate } from "@/lib/financial"
import { dayKeyOfStored } from "@/features/security/lib/date-closing"
import { assertWritable } from "@/features/security/services/date-closing.service"
import type { WriteContext } from "@/features/security/services/write-context"

export async function updateTransactionDate(
  id: string,
  userId: string,
  date: string,
  ctx: WriteContext
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.transaction.findFirst({
      where: {
        id,
        userId,
      },
      select: { id: true, date: true },
    })

    if (!existing) return null

    // O dia de onde sai e o dia para onde vai: fechado de qualquer lado, não muda.
    const storedDate = normalizeDate(date)
    await assertWritable(tx, ctx, {
      days: [dayKeyOfStored(existing.date), dayKeyOfStored(storedDate)],
    })

    const transaction = await tx.transaction.update({
      where: { id },
      data: { date: storedDate },
    })

    return transaction
  })
}
