/**
 * Páginas legais: públicas em QUALQUER situação, e é isso que as separa das outras
 * rotas públicas do app.
 *
 * `publicRoutes` (login, signup) manda quem já está logado de volta para o dashboard,
 * e em modo demo quem não tem sessão vai para o provisionamento. Nenhuma das duas
 * coisas pode acontecer aqui: a tela de consentimento do Google aponta para este
 * endereço, e o Google exige que ele abra sem login, em qualquer instalação, inclusive
 * antes de o Setup terminar.
 */
export const LEGAL_ROUTES = ["/privacidade"] as const

export function isLegalRoute(pathname: string): boolean {
  return (LEGAL_ROUTES as readonly string[]).includes(pathname)
}
