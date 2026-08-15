import { endOfMonth } from "date-fns"
import { getTranslations } from "next-intl/server"

import { startOfUTCDay, endOfUTCDay } from "@/lib/financial"
import { getTransactions } from "@/features/transactions/services/get-transactions"
import { getFormOptions } from "@/features/transactions/services/get-form-options"
import { getDefaultUserId } from "@/features/transactions/services/get-default-user-id"
import { getAccountsWithBalance } from "@/features/accounts/services/get-accounts"
import { getFinancialSummary } from "@/features/shared/services/get-financial-summary"
import { TransactionsClient } from "@/features/transactions/components/transactions-client"

export default async function TransactionsPage() {
  const userId = await getDefaultUserId()

  if (!userId) {
    const t = await getTranslations("common")
    return (
      <div className="flex items-center justify-center h-96 px-4 md:px-6">
        <p className="text-muted-foreground">
          {t("noUserFound")}
        </p>
      </div>
    )
  }

  // Primeiro paint alinhado ao período inicial do cliente para /transactions ("hoje",
  // ver src/lib/date-range-defaults.ts) e ao contrato da API (/api/transactions:
  // início/fim do dia em UTC; saldo de fim de mês calculado a partir de `to`).
  const now = new Date()
  const from = startOfUTCDay(now)
  const to = endOfUTCDay(now)
  const eom = endOfMonth(to)

  const [
    { transactions, filterOptions },
    formOptions,
    balancesAtDate,
    balancesAtEndOfMonth,
    summary,
  ] = await Promise.all([
    getTransactions({ userId, from, to }),
    getFormOptions(userId),
    getAccountsWithBalance(userId, to),
    getAccountsWithBalance(userId, eom),
    getFinancialSummary(userId, from, to),
  ])

  return (
    <TransactionsClient
      initialTransactions={transactions}
      initialFilterOptions={filterOptions}
      formOptions={formOptions}
      initialBalancesAtDate={balancesAtDate}
      initialBalancesAtEndOfMonth={balancesAtEndOfMonth}
      initialSummary={summary}
    />
  )
}
