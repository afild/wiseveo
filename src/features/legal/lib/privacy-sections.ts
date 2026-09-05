/**
 * Ordem em que as seções da política aparecem na tela.
 *
 * Por que uma lista aqui, e não a ordem do arquivo de tradução: JSON não garante ordem
 * de leitura para quem revisa, e a convenção do projeto é manter as chaves em ordem
 * alfabética. A ordem do documento é decisão de produto, então mora no código, e o teste
 * `tests/legal-privacy-messages.test.ts` garante que esta lista e os três arquivos de
 * tradução falem exatamente das mesmas seções.
 */
export const PRIVACY_SECTION_IDS = [
  "who",
  "stored",
  "googleLogin",
  "calendar",
  "drive",
  "googleData",
  "ai",
  "telegram",
  "demo",
  "cookies",
  "hosting",
  "retention",
  "deletion",
  "rights",
  "changes",
] as const

export type PrivacySectionId = (typeof PRIVACY_SECTION_IDS)[number]
