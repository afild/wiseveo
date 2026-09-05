/**
 * Propósito de um consentimento do Google que volta pelo callback da Agenda.
 *
 * Por que no `state`: registrar um endereço de retorno novo no Google Cloud é passo
 * manual fora do app, e o dono foi explícito contra. O `state` já vai e volta inteiro
 * (cookie httpOnly de 10 min), então um sufixo nele custa zero e continua sendo
 * comparado por igualdade estrita no callback. Sem sufixo = Agenda, que é o que
 * sempre existiu.
 */
export type GoogleOAuthPurpose = "calendar" | "backup"

const BACKUP_SUFFIX = ".backup"

export function stateWithPurpose(random: string, purpose: GoogleOAuthPurpose): string {
  return purpose === "backup" ? `${random}${BACKUP_SUFFIX}` : random
}

export function purposeOf(state: string | null | undefined): GoogleOAuthPurpose {
  return typeof state === "string" && state.endsWith(BACKUP_SUFFIX) ? "backup" : "calendar"
}
