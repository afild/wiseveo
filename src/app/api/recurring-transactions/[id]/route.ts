import { NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import { prisma } from "@/lib/prisma"
import { getWriteContext } from "@/features/security/services/write-context"
import { toPeriodInput } from "@/features/security/lib/date-closing"
import { normalizeDate, periodFromDate } from "@/lib/financial"

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const t = await getTranslations("api.errors")
    // Mesmo ator das rotas de lançamento. Sem trava de datas aqui (é o modelo, não um lançamento),
    // então o token de PIN não tem sentido e é descartado sem verificar.
    const ctx = await getWriteContext(request, { allowOverride: false })

    if (!ctx) {
        return NextResponse.json({ error: t("notAuthenticated") }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const data = { ...body } as Record<string, unknown>
    const isUpdatingLastDate =
        typeof data.lastDate === "string" && data.lastDate.trim().length > 0

    // Competência explícita e válida sempre vence; presente e ilegível é 400, com ou sem lastDate
    // (o corpo vai direto ao prisma, então nada entra sem passar por aqui). Só lastDate (edição em
    // lote de datas) continua rederivando a competência do mês da data.
    const hasPeriod = Object.prototype.hasOwnProperty.call(data, "period")
    const explicitPeriod = hasPeriod ? toPeriodInput(data.period) : null
    if (hasPeriod && explicitPeriod === null) {
        return NextResponse.json(
            { error: t("invalidPeriod") },
            { status: 400 }
        )
    }

    if (isUpdatingLastDate) {
        const nextLastDate = normalizeDate(String(data.lastDate))
        data.lastDate = nextLastDate
        data.period = explicitPeriod ?? periodFromDate(nextLastDate)
    } else if (explicitPeriod !== null) {
        data.period = explicitPeriod
    }

    // Sanitize text fields
    if (typeof data.note === "string") data.note = data.note.trim() || null
    if (typeof data.description === "string") data.description = data.description.trim() || null
    if (typeof data.reference === "string") data.reference = data.reference.trim() || null

    const hasPayeeIdField = Object.prototype.hasOwnProperty.call(data, "payeeId")
    const hasPayeeNameField = Object.prototype.hasOwnProperty.call(data, "payeeName")

    if (hasPayeeIdField || hasPayeeNameField) {
        const payeeName =
            typeof data.payeeName === "string" ? data.payeeName.trim() : ""
        const incomingPayeeId =
            typeof data.payeeId === "number" ? data.payeeId : null

        let resolvedPayeeId: number | null = null

        if (incomingPayeeId) {
            const existingPayee = await prisma.payee.findFirst({
                where: { id: incomingPayeeId, userId: ctx.ownerId },
                select: { id: true },
            })
            resolvedPayeeId = existingPayee?.id ?? null
        } else if (payeeName) {
            const existingByName = await prisma.payee.findFirst({
                where: {
                    userId: ctx.ownerId,
                    name: { equals: payeeName, mode: "insensitive" },
                },
                select: { id: true },
            })

            if (existingByName) {
                resolvedPayeeId = existingByName.id
            } else {
                const nextIdResult = await prisma.$queryRaw<Array<{ next_id: number }>>`
                    SELECT COALESCE(MAX("COD_BEN"), 0) + 1 AS next_id
                    FROM payees
                `
                const nextPayeeId = Number(nextIdResult[0]?.next_id ?? 1)
                const createdPayee = await prisma.payee.create({
                    data: {
                        id: nextPayeeId,
                        name: payeeName,
                        userId: ctx.ownerId,
                    },
                    select: { id: true },
                })
                resolvedPayeeId = createdPayee.id
            }
        }

        data.payeeId = resolvedPayeeId
        delete data.payeeName
    }

    const existing = await prisma.recurringTransaction.findFirst({
        where: { id, userId: ctx.ownerId },
        select: { id: true },
    })

    if (!existing) {
        return NextResponse.json({ error: t("recurrenceNotFound") }, { status: 404 })
    }

    const recurring = await prisma.recurringTransaction.update({
        where: { id },
        data,
        include: {
            payee: { select: { id: true, name: true } },
        },
    })

    return NextResponse.json(recurring)
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const t = await getTranslations("api.errors")
    const ctx = await getWriteContext(request, { allowOverride: false })

    if (!ctx) {
        return NextResponse.json({ error: t("notAuthenticated") }, { status: 401 })
    }

    const { id } = await params

    const existing = await prisma.recurringTransaction.findFirst({
        where: { id, userId: ctx.ownerId },
        select: { id: true },
    })

    if (!existing) {
        return NextResponse.json({ error: t("recurrenceNotFound") }, { status: 404 })
    }

    await prisma.recurringTransaction.delete({
        where: { id },
    })

    return NextResponse.json({ success: true })
}
