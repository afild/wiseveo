import { getTranslations } from "next-intl/server"
import { prisma } from "@/lib/prisma"
import { periodFromDate } from "@/lib/financial"
import type { WriteContext } from "@/features/security/services/write-context"
import { createTransaction } from "./create-transaction"

export async function copyTransaction(
  transactionId: string,
  targetDate: string,
  userId: string,
  ctx: WriteContext
) {
  const original = await prisma.transaction.findUnique({
    where: {
      id: transactionId,
      userId,
    },
    include: {
      category: true,
      payee: true,
    },
  })

  if (!original) {
    const t = await getTranslations("transactions.services.copy")
    throw new Error(t("notFound"))
  }

  // Cria um clone estruturado com base no payload da original
  // Mas ignoramos campos únicos, num e status de pagamento (se houver lógica).
  // Apenas metadados financeiros.
  const input = {
    userId,
    date: targetDate,
    period: periodFromDate(targetDate),
    reference: original.reference ?? undefined,
    note: original.note ?? undefined,
    description: original.description ?? undefined,
    amount: original.amount,
    type: original.type,
    accountId: original.accountId,
    groupCode: original.groupCode,
    categoryCode: original.categoryCode,
    statusCode: Number(original.statusCode),
    payeeId: original.payeeId ?? undefined,
    destAccountId: original.destAccountId ?? undefined,
  }

  // A cópia é um lançamento novo: quem confere o dia de destino é o createTransaction.
  return createTransaction(input, ctx)
}
