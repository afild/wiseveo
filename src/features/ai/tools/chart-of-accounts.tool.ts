import { tool } from "ai"
import { z } from "zod"
import { getFormOptions } from "@/features/transactions/services/get-form-options"
import type { AgentToolContext } from "@/features/ai/types/agent.types"

/**
 * O vocabulário do usuário: nomes REAIS de contas, grupos, categorias e
 * favorecidos. Sem isto, o agente chuta ("supermercado" quando a categoria se
 * chama "Mercado") e volta de mãos vazias sem entender por quê. É a ferramenta
 * que ele deve chamar quando um filtro por nome não encontra nada.
 */
export function createChartOfAccountsTool(userId: string, _ctx: AgentToolContext) {
  return tool({
    // i18n-ignore: descrição lida pelo modelo, não é texto de UI
    description:
      // i18n-ignore: texto lido pelo MODELO, não é UI
      "Lista os nomes REAIS do plano de contas do usuário: bancos/contas, grupos, categorias e favorecidos (lojas). Use ANTES de filtrar por nome quando não tiver certeza de como algo se chama, ou DEPOIS de uma busca voltar vazia, para achar o nome correto e tentar de novo. Nunca invente nomes de categoria ou conta: consulte aqui.",
    inputSchema: z.object({
      search: z
        .string()
        .nullable()
        // i18n-ignore: texto lido pelo MODELO (descrição de ferramenta/campo), não é UI
        .describe("Filtra os nomes por um trecho de texto (sem diferenciar maiúsculas). Nulo = tudo."),
    }),
    execute: async ({ search }) => {
      const options = await getFormOptions(userId)
      const needle = search?.trim().toLowerCase() ?? ""
      const matches = (name: string) => !needle || name.toLowerCase().includes(needle)

      const accounts = options.accounts.filter((item) => matches(item.name)).map((item) => item.name)
      const groups = options.groups.filter((item) => matches(item.name)).map((item) => item.name)
      const categories = options.categories
        .filter((item) => matches(item.name))
        .map((item) => item.name)
      // Favorecidos podem ser milhares: sem busca, devolve só uma amostra.
      const allPayees = options.payees.filter((item) => matches(item.name)).map((item) => item.name)

      return {
        accounts,
        groups,
        categories,
        statuses: options.statuses.map((item) => item.name),
        payeeCount: allPayees.length,
        payees: allPayees.slice(0, needle ? 40 : 20),
        truncated: allPayees.length > (needle ? 40 : 20),
      }
    },
  })
}
