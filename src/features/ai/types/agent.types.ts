import type { getTranslations } from "next-intl/server"
import type { AppLocale } from "@/i18n/config"
import type { MonetaryFormatter } from "@/lib/monetary"

/**
 * Contexto que TODA ferramenta do agente recebe. Fica aqui, na camada de IA, e
 * não num canal: as mesmas ferramentas servem o Telegram hoje, a página Advisor
 * na Etapa 3 e o WhatsApp adiante — canal e motor são coisas separadas.
 *
 * O tradutor continua preso ao espaço "telegram" porque é lá que moram os
 * rótulos de dado que as ferramentas usam (ex.: "sem descrição"); cada canal
 * resolve o seu uma vez por mensagem e passa adiante.
 */
export type AgentTranslator = Awaited<ReturnType<typeof getTranslations<"telegram">>>

export interface AgentToolContext {
  t: AgentTranslator
  locale: AppLocale
  monetary: MonetaryFormatter
  /**
   * QUEM está lendo — diferente do dono dos dados em conta compartilhada.
   * As ferramentas de leitura financeira usam o dono; as poucas que mexem em
   * PREFERÊNCIA (o tema do card) usam este, porque a preferência é da pessoa.
   */
  viewerId?: string
}
