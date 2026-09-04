import { NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import { prisma } from "@/lib/prisma"
import { getDefaultUserId } from "@/features/transactions/services/get-default-user-id"
import { getWriteContext } from "@/features/security/services/write-context"
import { periodFromDate, isValidPeriod } from "@/lib/financial"

export async function GET() {
    const userId = await getDefaultUserId()

    if (!userId) {
        const t = await getTranslations("api.errors")
        return NextResponse.json({ error: t("userNotFound") }, { status: 401 })
    }

    const recurring = await prisma.recurringTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        include: {
            account: { select: { id: true, name: true } },
            category: { select: { id: true, name: true } },
            payee: { select: { id: true, name: true } },
        },
    })

    return NextResponse.json(recurring)
}

export async function POST(request: Request) {
    // Mesmo ator das rotas de lançamento. Sem trava de datas aqui (é o modelo, não um lançamento),
    // então o token de PIN não tem sentido e é descartado sem verificar.
    const ctx = await getWriteContext(request, { allowOverride: false })

    if (!ctx) {
        const t = await getTranslations("api.errors")
        return NextResponse.json({ error: t("notAuthenticated") }, { status: 401 })
    }

    const body = await request.json()

    const period =
        body?.period && isValidPeriod(String(body.period))
            ? String(body.period)
            : periodFromDate(
                typeof body?.lastDate === "string" && body.lastDate
                    ? String(body.lastDate)
                    : undefined
            )

    // Minimal implementation for now to satisfy the structure
    const recurring = await prisma.recurringTransaction.create({
        data: {
            ...body,
            period,
            userId: ctx.ownerId,
        }
    })

    return NextResponse.json(recurring)
}
