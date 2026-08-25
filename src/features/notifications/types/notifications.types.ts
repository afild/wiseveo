import type { getTranslations } from "next-intl/server"
import type { AppLocale } from "@/i18n/config"
import type { MonetaryFormatter } from "@/lib/monetary"
import type { AgentTranslator } from "@/features/ai/types/agent.types"

/** Tradutor do espaço "notifications" — o texto dos avisos. */
export type NotificationsTranslator = Awaited<ReturnType<typeof getTranslations<"notifications">>>

/**
 * O que todo construtor de aviso recebe. Resolvido UMA vez por pessoa, no
 * tique, e passado adiante: fora de uma requisição não existe cookie de idioma,
 * então nada pode voltar a "descobrir" o locale sozinho — descobriria o da
 * instalação, não o da pessoa.
 */
export interface NotificationContext {
  locale: AppLocale
  monetary: MonetaryFormatter
  t: NotificationsTranslator
  /** Tradutor do espaço "telegram": os cards têm rótulos próprios lá dentro. */
  cardT: AgentTranslator
}
