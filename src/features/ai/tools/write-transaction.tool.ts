import { tool } from "ai"
import { z } from "zod"
import type { AgentToolContext } from "@/features/ai/types/agent.types"

/**
 * LANÇAR TRANSAÇÃO PELA CONVERSA — DESENHADA E DESLIGADA.
 *
 * Não está em `getAgentTools`: nenhum modelo a enxerga hoje. Entra na Etapa 5,
 * e só com a regra que o dono definiu — o agente PROPÕE o lançamento montado, a
 * pessoa CONFIRMA, e só então grava. Nunca direto.
 *
 * O desenho fica aqui desde já para que o formato da proposta (o que o agente
 * precisa resolver antes de perguntar "confirma?") não seja inventado às
 * pressas depois: conta, categoria e status têm de ser NOMES REAIS do plano de
 * contas, resolvidos via get_chart_of_accounts — não texto livre.
 */

export const proposedTransactionSchema = z.object({
  // i18n-ignore: texto lido pelo MODELO (descrição de ferramenta/campo), não é UI
  date: z.string().describe("Data do lançamento, YYYY-MM-DD."),
  // i18n-ignore: texto lido pelo MODELO (descrição de ferramenta/campo), não é UI
  amount: z.number().describe("Valor absoluto, sempre positivo. O tipo diz se entra ou sai."),
  type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
  // i18n-ignore: texto lido pelo MODELO (descrição de ferramenta/campo), não é UI
  description: z.string().describe("Descrição curta, com as palavras do usuário."),
  // i18n-ignore: texto lido pelo MODELO (descrição de ferramenta/campo), não é UI
  accountName: z.string().describe("Nome REAL de uma conta do plano de contas."),
  // i18n-ignore: texto lido pelo MODELO (descrição de ferramenta/campo), não é UI
  categoryName: z.string().describe("Nome REAL de uma categoria do plano de contas."),
  // i18n-ignore: texto lido pelo MODELO (descrição de ferramenta/campo), não é UI
  payeeName: z.string().nullable().describe("Loja/favorecido, se a pessoa disse. Nulo se não."),
  // i18n-ignore: texto lido pelo MODELO (descrição de ferramenta/campo), não é UI
  statusName: z.string().nullable().describe("Status pretendido (ex.: pago). Nulo = o padrão do usuário."),
})

export type ProposedTransaction = z.infer<typeof proposedTransactionSchema>

/**
 * A ferramenta NÃO grava: devolve a proposta para o canal pedir confirmação.
 * Quem grava é o canal, depois do "sim" — e por um serviço de escrita comum,
 * não por aqui. Assim o agente nunca tem, ele mesmo, poder de alterar dados.
 */
export function createProposeTransactionTool(_userId: string, _ctx: AgentToolContext) {
  return tool({
    // i18n-ignore: descrição lida pelo modelo, não é texto de UI
    description:
      // i18n-ignore: texto lido pelo MODELO, não é UI
      "Monta uma PROPOSTA de lançamento a partir do que a pessoa disse. NÃO grava nada: a proposta volta para ela confirmar. Antes de chamar, resolva conta e categoria com get_chart_of_accounts — só valem nomes reais do plano de contas.",
    inputSchema: proposedTransactionSchema,
    execute: async (proposal: ProposedTransaction) => ({ status: "awaiting_confirmation", proposal }),
  })
}
