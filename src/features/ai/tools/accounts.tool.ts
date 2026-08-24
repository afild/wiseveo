import { tool } from "ai"
import { z } from "zod"
import { getAccountsWithBalance } from "@/features/accounts/services/get-accounts"
import { parseToolDate } from "./tool-utils"
import { endOfUTCDay } from "@/lib/financial"
import type { AgentToolContext } from "@/features/ai/types/agent.types"

export function createAccountBalancesTool(userId: string, ctx: AgentToolContext) {
  return tool({
    // Tool metadata below (description/describe) is an LLM function-calling
    // definition, not UI copy — kept in Portuguese and i18n-ignored throughout.
    description:
      "Retorna os saldos atuais ou saldos ate uma data de todas as contas ativas do usuario.", // i18n-ignore
    inputSchema: z.object({
      toDate: z.string().optional().describe("Data limite no formato YYYY-MM-DD. Padrao: agora."), // i18n-ignore
    }),
    execute: async ({ toDate }) => {
      const cutoff = toDate ? parseToolDate(toDate, endOfUTCDay(new Date()), "end") : undefined
      const accounts = await getAccountsWithBalance(userId, cutoff)
      const totalBalance = accounts.reduce((sum, account) => sum + account.currentBalance, 0)

      return {
        asOf: cutoff?.toISOString() ?? new Date().toISOString(),
        totalBalance,
        formattedTotalBalance: ctx.monetary.formatNumberValue(totalBalance),
        accounts: accounts.map((account) => ({
          id: account.id,
          name: account.name,
          type: account.type,
          initialBalance: account.initialBalance,
          formattedInitialBalance: ctx.monetary.formatNumberValue(account.initialBalance),
          currentBalance: account.currentBalance,
          formattedCurrentBalance: ctx.monetary.formatNumberValue(account.currentBalance),
        })),
      }
    },
  })
}
