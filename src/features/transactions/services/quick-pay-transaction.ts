import { getTranslations } from "next-intl/server"
import { getUserQuickPaymentSettings } from "@/features/settings/services/user-settings-service"
import { prisma } from "@/lib/prisma"
import { dayKeyOfStored } from "@/features/security/lib/date-closing"
import { assertWritable } from "@/features/security/services/date-closing.service"
import type { WriteContext } from "@/features/security/services/write-context"

interface QuickPayResult {
  success: boolean
  error?: string
}

export async function quickPayTransaction(
  id: string,
  userId: string,
  ctx: WriteContext
): Promise<QuickPayResult> {
  const t = await getTranslations("transactions.services.quickPay")
  const quickPayment = await getUserQuickPaymentSettings(userId)

  if (
    quickPayment.defaultAccountId === null ||
    quickPayment.defaultStatusCode === null
  ) {
    return {
      success: false,
      error: t("missingDefaults"),
    }
  }

  const [account, status, existing] = await Promise.all([
    prisma.account.findFirst({
      where: {
        id: quickPayment.defaultAccountId,
        userId,
        active: true,
      },
      select: { id: true },
    }),
    prisma.transactionStatusLookup.findFirst({
      where: {
        code: quickPayment.defaultStatusCode,
        userId,
      },
      select: { code: true },
    }),
    prisma.transaction.findFirst({
      where: { id, userId },
      select: { id: true, date: true },
    }),
  ])

  if (!account || !status) {
    return {
      success: false,
      error: t("invalidDefaults"),
    }
  }

  if (!existing) return { success: false, error: t("transactionNotFound") }

  // Fora do closure: dentro dele o tsc perde o estreitamento feito acima.
  const { defaultAccountId, defaultStatusCode } = quickPayment

  // Transação curta só para a escrita: a guarda lê a linha do dono e grava sem soltar.
  await prisma.$transaction(async (tx) => {
    await assertWritable(tx, ctx, { days: [dayKeyOfStored(existing.date)] })

    await tx.transaction.update({
      where: { id },
      data: {
        accountId: defaultAccountId,
        statusCode: defaultStatusCode,
      },
    })
  })

  return { success: true }
}
