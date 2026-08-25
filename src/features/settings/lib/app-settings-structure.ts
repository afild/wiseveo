/**
 * As peças que "Preparar meu banco" (aba Integrações) acrescenta, numa
 * confirmação só: `app_settings` (segredos cifrados — token do bot, chaves de
 * IA), `ai_usage` (consumo de IA por mês, para o teto de gasto),
 * `advisor_messages` (as conversas da página Advisor),
 * `notification_deliveries` (o que já foi enviado, para o boletim sair uma vez
 * só) e `kpi_snapshots` (a foto mensal dos indicadores). Módulo puro — o
 * serviço, a tela e os testes leem daqui para nunca divergirem.
 */
export const APP_SETTINGS_TABLE = "app_settings"
export const AI_USAGE_TABLE = "ai_usage"
export const ADVISOR_MESSAGES_TABLE = "advisor_messages"
export const NOTIFICATION_DELIVERIES_TABLE = "notification_deliveries"
export const KPI_SNAPSHOTS_TABLE = "kpi_snapshots"
export const INTEGRATION_TABLES = [
  APP_SETTINGS_TABLE,
  AI_USAGE_TABLE,
  ADVISOR_MESSAGES_TABLE,
  NOTIFICATION_DELIVERIES_TABLE,
  KPI_SNAPSHOTS_TABLE,
] as const

export type IntegrationTable = (typeof INTEGRATION_TABLES)[number]

export interface AppSettingsStructure {
  /** Tudo presente — é o que decide se o cartão "Preparar meu banco" aparece. */
  ready: boolean
  /**
   * Só a tabela de segredos. O bot do Telegram e as chaves de IA dependem
   * DESTA, e de mais nada: sem separar, acrescentar a tabela do medidor
   * derrubaria a tela do bot numa instalação que já estava preparada.
   */
  secretsReady: boolean
  /** Só a tabela de conversas — é dela que a página Advisor depende. */
  advisorReady: boolean
  /**
   * Só o registro de envios. Sem ele o relógio NÃO envia nada: a garantia de
   * "uma vez só" mora na chave única dessa tabela, e enviar sem ela repetiria o
   * boletim a cada batida do despertador.
   */
  notificationsReady: boolean
  /** Só a foto mensal dos indicadores — sem ela o boletim perde a comparação. */
  kpiHistoryReady: boolean
  missing: IntegrationTable[]
}

export function checkAppSettingsStructure(input: { existingTables: string[] }): AppSettingsStructure {
  const missing = INTEGRATION_TABLES.filter((table) => !input.existingTables.includes(table))
  return {
    ready: missing.length === 0,
    secretsReady: input.existingTables.includes(APP_SETTINGS_TABLE),
    advisorReady: input.existingTables.includes(ADVISOR_MESSAGES_TABLE),
    notificationsReady: input.existingTables.includes(NOTIFICATION_DELIVERIES_TABLE),
    kpiHistoryReady: input.existingTables.includes(KPI_SNAPSHOTS_TABLE),
    missing: [...missing],
  }
}
