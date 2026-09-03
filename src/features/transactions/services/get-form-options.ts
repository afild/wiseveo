import { prisma } from "@/lib/prisma"
import { listTransactionStatuses } from "./transaction-status-lookup"
import type { TransactionFormOptions } from "../types"

export async function getFormOptions(
  userId: string
): Promise<TransactionFormOptions> {
  const [accounts, groups, categories, statuses, payees] = await Promise.all([
    prisma.account.findMany({
      where: { userId, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.categoryGroup.findMany({
      where: { userId },
      select: { id: true, code: true, name: true, type: true },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({
      where: { userId },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        groupId: true,
      },
      orderBy: { name: "asc" },
    }),
    // Catálogo compartilhado: sem filtro por usuário, de propósito.
    listTransactionStatuses(),
    prisma.payee.findMany({
      where: { userId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ])

  return { accounts, groups, categories, statuses, payees }
}
