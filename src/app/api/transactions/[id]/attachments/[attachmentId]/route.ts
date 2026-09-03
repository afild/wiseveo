import { NextResponse, type NextRequest } from "next/server"
import { getTranslations } from "next-intl/server"

import { prisma } from "@/lib/prisma"
import { getDefaultUserId } from "@/features/transactions/services/get-default-user-id"
import { respondDateClosed } from "@/features/security/lib/http"
import { dayKeyOfStored } from "@/features/security/lib/date-closing"
import { assertWritable } from "@/features/security/services/date-closing.service"
import { getWriteContext } from "@/features/security/services/write-context"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const t = await getTranslations("api")
  const userId = await getDefaultUserId()
  if (!userId) {
    return NextResponse.json({ error: t("errors.userNotFound") }, { status: 401 })
  }

  const { id: transactionId, attachmentId } = await params

  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, userId },
    select: { id: true },
  })
  if (!transaction) {
    return NextResponse.json({ error: t("errors.transactionNotFound") }, { status: 404 })
  }

  const attachment = await prisma.transactionAttachment.findFirst({
    where: { id: attachmentId, transactionId },
    select: { fileData: true, mimeType: true, fileName: true, fileSize: true },
  })
  if (!attachment) {
    return NextResponse.json({ error: t("transactions.attachmentNotFound") }, { status: 404 })
  }

  const shouldDownload = request.nextUrl.searchParams.get("download") === "1"
  const disposition = shouldDownload ? "attachment" : "inline"
  const safeFileName = attachment.fileName.replace(/"/g, "")

  return new NextResponse(Buffer.from(attachment.fileData), {
    status: 200,
    headers: {
      "Content-Type": attachment.mimeType || "application/octet-stream",
      "Content-Length": String(attachment.fileSize),
      "Content-Disposition": `${disposition}; filename="${safeFileName}"`,
      "Cache-Control": "private, max-age=60",
    },
  })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const t = await getTranslations("api")
  // O contexto de escrita (ator + dono + token de PIN) substitui o userId solto.
  const ctx = await getWriteContext(request)
  if (!ctx) {
    return NextResponse.json({ error: t("errors.userNotFound") }, { status: 401 })
  }
  const userId = ctx.ownerId

  const { id: transactionId, attachmentId } = await params

  try {
    // Tudo DENTRO da transação que apaga: a linha (com a DATA) e o anexo. Lida antes dela, a data
    // pode já não ser a da linha, e a trava aprovaria um dia que acabou de ser fechado. A busca do
    // anexo continua antes da conferência para manter a ordem de sempre: "não encontrado" ganha de
    // "data fechada". Mesma regra do quickPayTransaction.
    const outcome = await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findFirst({
        where: { id: transactionId, userId },
        select: { id: true, date: true },
      })
      if (!transaction) return "transactionNotFound" as const

      const attachment = await tx.transactionAttachment.findFirst({
        where: { id: attachmentId, transactionId },
        select: { id: true },
      })
      if (!attachment) return "attachmentNotFound" as const

      await assertWritable(tx, ctx, { days: [dayKeyOfStored(transaction.date)] })
      await tx.transactionAttachment.delete({ where: { id: attachmentId } })
      return "deleted" as const
    })

    if (outcome === "transactionNotFound") {
      return NextResponse.json({ error: t("errors.transactionNotFound") }, { status: 404 })
    }
    if (outcome === "attachmentNotFound") {
      return NextResponse.json({ error: t("transactions.attachmentNotFound") }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const locked = respondDateClosed(error, t)
    if (locked) return locked
    console.error("Error deleting transaction attachment:", error)
    return NextResponse.json({ error: t("transactions.deleteAttachmentFailed") }, { status: 500 })
  }
}
