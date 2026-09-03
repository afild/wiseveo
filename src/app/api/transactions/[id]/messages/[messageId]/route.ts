import { NextResponse, type NextRequest } from "next/server"
import { getTranslations } from "next-intl/server"

import { prisma } from "@/lib/prisma"
import { respondDateClosed } from "@/features/security/lib/http"
import { dayKeyOfStored } from "@/features/security/lib/date-closing"
import { assertWritable } from "@/features/security/services/date-closing.service"
import { getWriteContext } from "@/features/security/services/write-context"

// DELETE /api/transactions/[id]/messages/[messageId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  const t = await getTranslations("api")
  // O contexto de escrita (ator + dono + token de PIN) substitui o userId solto.
  const ctx = await getWriteContext(request)
  if (!ctx) {
    return NextResponse.json({ error: t("errors.userNotFound") }, { status: 401 })
  }
  const userId = ctx.ownerId

  const { id: transactionId, messageId } = await params

  try {
    // A linha (com a DATA) é lida DENTRO da transação que apaga, e a conferência vem logo depois:
    // lida antes dela, a data pode já não ser a da linha, e a trava aprovaria um dia que acabou de
    // ser fechado. Mesma regra do quickPayTransaction.
    const deleted = await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findFirst({
        where: { id: transactionId, userId },
        select: { id: true, date: true },
      })
      if (!transaction) return null
      await assertWritable(tx, ctx, { days: [dayKeyOfStored(transaction.date)] })
      return tx.$queryRaw<Array<{ id: string }>>`
        DELETE FROM public.transaction_messages
        WHERE id = ${messageId}
          AND transaction_id = ${transactionId}
        RETURNING id
      `
    })

    if (deleted === null) {
      return NextResponse.json({ error: t("errors.transactionNotFound") }, { status: 404 })
    }

    if (deleted.length === 0) {
      return NextResponse.json({ error: t("transactions.messageNotFound") }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const locked = respondDateClosed(error, t)
    if (locked) return locked
    console.error("Error deleting transaction message:", error)
    return NextResponse.json({ error: t("transactions.deleteMessageFailed") }, { status: 500 })
  }
}
