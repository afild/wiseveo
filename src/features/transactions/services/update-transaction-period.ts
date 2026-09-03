import { prisma } from "@/lib/prisma"
import { isValidPeriod } from "@/lib/financial"
import { dayKeyOfStored, storedPeriod } from "@/features/security/lib/date-closing"
import { assertWritable } from "@/features/security/services/date-closing.service"
import type { WriteContext } from "@/features/security/services/write-context"

export async function updateTransactionPeriod(
  id: string,
  userId: string,
  period: string,
  ctx: WriteContext
) {
  if (!isValidPeriod(period)) {
    return { error: "invalid_period" as const }
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.transaction.findFirst({
      where: { id, userId },
      select: { id: true, date: true, period: true },
    })

    if (!existing) return null

    // A data não muda; as competências, sim — a de saída e a de chegada.
    await assertWritable(tx, ctx, {
      days: [dayKeyOfStored(existing.date)],
      periods: [storedPeriod(existing.period), period],
    })

    const transaction = await tx.transaction.update({
      where: { id },
      data: { period },
    })

    return transaction
  })
}
