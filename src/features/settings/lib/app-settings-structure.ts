/**
 * As peças que "Preparar meu banco" (aba Integrações) acrescenta: a tabela
 * `app_settings` (segredos cifrados — token do bot, chaves de IA) e a tabela
 * `ai_usage` (consumo de IA por mês, para o teto de gasto). Módulo puro — o
 * serviço, a tela e os testes leem daqui para nunca divergirem.
 */
export const APP_SETTINGS_TABLE = "app_settings"
export const AI_USAGE_TABLE = "ai_usage"
export const INTEGRATION_TABLES = [APP_SETTINGS_TABLE, AI_USAGE_TABLE] as const

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
  missing: IntegrationTable[]
}

export function checkAppSettingsStructure(input: { existingTables: string[] }): AppSettingsStructure {
  const missing = INTEGRATION_TABLES.filter((table) => !input.existingTables.includes(table))
  return {
    ready: missing.length === 0,
    secretsReady: input.existingTables.includes(APP_SETTINGS_TABLE),
    missing: [...missing],
  }
}
