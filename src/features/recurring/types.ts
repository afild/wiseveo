import type { TransactionType } from "@/generated/prisma_new/client"

export interface SerializedRecurringTransaction {
    id: string
    period: string
    note: string | null
    description: string | null
    amount: number
    type: TransactionType
    lastDate: string | null
    reference: string | null
    accountId: number
    groupCode: number
    categoryCode: string
    statusCode: number
    payeeId: number | null
    account: {
        id: string
        name: string
    }
    category: {
        id: string
        name: string
        group: {
            id: string
            name: string
        }
    }
    status: {
        name: string
    }
    payee: {
        id: string
        name: string
    } | null
}

export interface RecurringFilterOptions {
    accounts: Array<{ id: string; name: string }>
    categories: Array<{ id: string; name: string; groupName: string }>
    types: TransactionType[]
}

export interface RecurringTableMeta {
    onLaunchRecurring?: (recurring: SerializedRecurringTransaction) => void
    onEditRecurring?: (recurring: SerializedRecurringTransaction) => void
    onDeleteRecurring?: (recurring: SerializedRecurringTransaction) => void
}
