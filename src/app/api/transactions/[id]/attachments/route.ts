import { NextResponse, type NextRequest } from "next/server"
import { getTranslations } from "next-intl/server"

import type { Prisma } from "@/generated/prisma_new/client"
import { prisma } from "@/lib/prisma"
import { getDefaultUserId } from "@/features/transactions/services/get-default-user-id"
import { respondDateClosed } from "@/features/security/lib/http"
import { dayKeyOfStored } from "@/features/security/lib/date-closing"
import { assertWritable } from "@/features/security/services/date-closing.service"
import { getWriteContext } from "@/features/security/services/write-context"

const MAX_FILE_SIZE = 3 * 1024 * 1024 // 3 MB
/**
 * Teto de arquivos por envio. Os bytes de todos eles ficam na memória do servidor até a gravação
 * terminar, então sem teto um único envio derruba o processo. Dez comprovantes de uma vez cobrem o
 * uso real de sobra; o resto volta com 400 e a pessoa envia em duas levas.
 */
const MAX_FILES = 10
/**
 * O padrão do Prisma para transação interativa é 5 s, e aqui a transação carrega os arquivos: o
 * pior caso realista é MAX_FILES x MAX_FILE_SIZE (10 x 3 MB = 30 MB) gravados num banco remoto.
 * 60 s dão folga larga para isso e ainda põem um teto, em vez de deixar a transação presa. O
 * maxWait maior é para o pool ocupado não recusar o envio antes mesmo de começar.
 */
const UPLOAD_TX_OPTIONS = { maxWait: 10_000, timeout: 60_000 }
const ALLOWED_MIME = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
]

// POST /api/transactions/[id]/attachments
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const t = await getTranslations("api")
    // O contexto de escrita (ator + dono + token de PIN) substitui o userId solto.
    const ctx = await getWriteContext(request)
    if (!ctx) {
        return NextResponse.json({ error: t("errors.userNotFound") }, { status: 401 })
    }
    const userId = ctx.ownerId

    const { id: transactionId } = await params

    try {
        let formData: FormData
        try {
            formData = await request.formData()
        } catch {
            return NextResponse.json({ error: t("transactions.invalidFormData") }, { status: 400 })
        }

        const files = formData.getAll("files") as File[]
        if (!files || files.length === 0) {
            return NextResponse.json({ error: t("transactions.noFilesUploaded") }, { status: 400 })
        }
        // Antes de ler byte nenhum: passar do teto é recusa da leva inteira, não meia gravação.
        if (files.length > MAX_FILES) {
            return NextResponse.json(
                { error: t("transactions.tooManyFiles", { max: MAX_FILES }) },
                { status: 400 }
            )
        }

        const errors: string[] = []
        const pending: Prisma.TransactionAttachmentUncheckedCreateInput[] = []

        for (const file of files) {
            // Validate type
            if (!ALLOWED_MIME.includes(file.type)) {
                errors.push(t("transactions.fileTypeNotAllowed", { fileName: file.name }))
                continue
            }
            // Validate size
            if (file.size > MAX_FILE_SIZE) {
                errors.push(t("transactions.fileTooLarge", { fileName: file.name }))
                continue
            }

            pending.push({
                id: crypto.randomUUID(),
                transactionId,
                fileName: file.name,
                fileSize: file.size,
                mimeType: file.type,
                fileData: Buffer.from(await file.arrayBuffer()),
            })
        }

        const saved = await prisma.$transaction(async (tx) => {
            // A linha (com a DATA) é lida DENTRO da transação que grava, e a conferência vem logo
            // depois: lida antes dela, a data pode já não ser a da linha, e a trava aprovaria um dia
            // que acabou de ser fechado. Mesma regra do quickPayTransaction.
            const transaction = await tx.transaction.findFirst({
                where: { id: transactionId, userId },
                select: { id: true, date: true },
            })
            if (!transaction) return null
            // UMA conferência, antes do laço: o dia é o mesmo para todos os arquivos, e a transação
            // é a mesma que grava.
            await assertWritable(tx, ctx, { days: [dayKeyOfStored(transaction.date)] })
            const rows: { id: string; fileName: string; mimeType: string; fileSize: number }[] = []
            for (const data of pending) {
                rows.push(
                    await tx.transactionAttachment.create({
                        data,
                        select: { id: true, fileName: true, mimeType: true, fileSize: true },
                    })
                )
            }
            return rows
        }, UPLOAD_TX_OPTIONS)

        if (saved === null) {
            return NextResponse.json({ error: t("errors.transactionNotFound") }, { status: 404 })
        }

        return NextResponse.json(
            { saved, errors: errors.length > 0 ? errors : undefined },
            { status: 201 }
        )
    } catch (error) {
        const locked = respondDateClosed(error, t)
        if (locked) return locked
        console.error("Error saving transaction attachments:", error)
        return NextResponse.json({ error: t("transactions.saveAttachmentsFailed") }, { status: 500 })
    }
}

// GET /api/transactions/[id]/attachments
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const t = await getTranslations("api.errors")
    const userId = await getDefaultUserId()
    if (!userId) {
        return NextResponse.json({ error: t("userNotFound") }, { status: 401 })
    }

    const { id: transactionId } = await params

    const transaction = await prisma.transaction.findFirst({
        where: { id: transactionId, userId },
        select: { id: true },
    })
    if (!transaction) {
        return NextResponse.json({ error: t("transactionNotFound") }, { status: 404 })
    }

    const attachments = await prisma.transactionAttachment.findMany({
        where: { transactionId },
        select: { id: true, fileName: true, mimeType: true, fileSize: true, createdAt: true },
        orderBy: { createdAt: "asc" },
    })

    return NextResponse.json({ attachments })
}
