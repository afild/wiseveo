import { prisma } from "@/lib/prisma"
import type { SerializedRecurringTransaction, RecurringFilterOptions } from "../types"

export async function getRecurring(userId: string) {
    const [rawRecurring, accounts, categories] = await Promise.all([
        prisma.recurringTransaction.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            include: {
                account: { select: { id: true, name: true } },
                category: {
                    select: {
                        id: true,
                        name: true,
                        group: { select: { id: true, name: true } },
                    },
                },
                payee: { select: { id: true, name: true } },
                statusLookup: { select: { name: true } },
            },
        }),
        prisma.account.findMany({
            where: { userId, active: true },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
        }),
        prisma.category.findMany({
            where: { userId },
            select: { id: true, name: true, group: { select: { name: true } } },
            orderBy: { name: "asc" },
        }),
    ])

    const recurring: SerializedRecurringTransaction[] = rawRecurring.map((r) => ({
        id: r.id,
        period: r.period,
        note: r.note,
        description: r.description,
        amount: Number(r.amount),
        type: r.type,
        lastDate: r.lastDate?.toISOString() ?? null,
        reference: r.reference,
        accountId: r.accountId,
        groupCode: r.groupCode,
        categoryCode: r.categoryCode,
        statusCode: r.statusCode,
        payeeId: r.payeeId,
        account: {
            id: String(r.account.id),
            name: r.account.name,
        },
        category: {
            id: r.category.id,
            name: r.category.name,
            group: r.category.group,
        },
        payee: r.payee
            ? {
                id: String(r.payee.id),
                name: r.payee.name,
            }
            : null,
        status: {
            name: r.statusLookup?.name ?? "Pending" // i18n-ignore: nome de status gravado no banco (dado), não é texto de UI
        }
    }))

    const filterOptions: RecurringFilterOptions = {
        accounts: accounts.map((a) => ({ id: String(a.id), name: a.name })),
        categories: categories.map((c) => ({
            id: c.id,
            name: c.name,
            groupName: c.group.name,
        })),
        types: ["INCOME", "EXPENSE", "TRANSFER"],
    }

    return { recurring, filterOptions }
}
