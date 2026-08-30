import { tool } from "ai"
import { z } from "zod"
import { setUserCardTheme } from "@/features/settings/services/user-settings-service"
import type { AgentToolContext } from "@/features/ai/types/agent.types"

/**
 * A ÚNICA ferramenta de escrita ligada — e ela não toca em dinheiro.
 *
 * Serve para a pessoa trocar o tema dos quadros falando ("manda no tema claro",
 * "prefiro escuro"), sem menu e sem comando decorado. Por isso é a IA quem
 * decide: ela é que entende a frase; uma regra de texto erraria em metade das
 * formas de pedir.
 *
 * O limite é o que a torna segura: grava UMA preferência de cor, do próprio
 * leitor (`viewerId`, não o dono dos dados), com dois valores possíveis. Lançar
 * transação continua desligado, e continua sendo outra conversa.
 */
export function createCardThemeTool(ctx: AgentToolContext) {
  return tool({
    // i18n-ignore: descrição lida pelo modelo, não é texto de UI
    description:
      // i18n-ignore
      "Troca o tema visual dos quadros/cards desta pessoa entre claro e escuro, e guarda a escolha para as próximas mensagens e boletins. Use quando ela pedir de qualquer forma ('manda no claro', 'prefiro tema escuro', 'fundo branco fica melhor'). Depois de trocar, apenas confirme em uma frase — o próximo quadro já sai no tema novo.",
    inputSchema: z.object({
      mode: z
        .enum(["light", "dark"])
        // i18n-ignore
        .describe("'light' para fundo claro, 'dark' para fundo escuro."),
    }),
    execute: async ({ mode }) => {
      if (!ctx.viewerId) {
        // i18n-ignore: resposta lida pelo MODELO
        return { ok: false, reason: "Sem pessoa identificada nesta conversa." }
      }

      await setUserCardTheme(ctx.viewerId, mode)
      return { ok: true, mode }
    },
  })
}
