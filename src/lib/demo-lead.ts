// Validação do "bilhete de entrada" da edição na demo: nome + e-mail (captação
// tácita de leads — decisão do dono, 30/08/2026). Formato apenas: a demo não
// tem infraestrutura de e-mail para confirmar posse.
export const MAX_LEAD_FIELD = 200
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function isValidLeadEmail(email: string): boolean {
  return email.length > 0 && email.length <= MAX_LEAD_FIELD && EMAIL_RE.test(email)
}
