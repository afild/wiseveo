/**
 * A peça que "Preparar meu banco" (aba Integrações) acrescenta: a tabela
 * `app_settings`, onde a instalação guarda segredos cifrados (token do bot do
 * Telegram; adiante, chaves de IA). Módulo puro — o serviço e os testes leem daqui
 * para a tela e o SQL nunca divergirem.
 */
export const APP_SETTINGS_TABLE = "app_settings"

export interface AppSettingsStructure {
  ready: boolean
  missing: Array<"table">
}

export function checkAppSettingsStructure(input: { hasTable: boolean }): AppSettingsStructure {
  return input.hasTable ? { ready: true, missing: [] } : { ready: false, missing: ["table"] }
}
