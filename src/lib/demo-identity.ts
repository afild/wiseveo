/**
 * D6 (dono, 30/08/2026): na DEMO todo usuário se apresenta como a marca única
 * WISEVEO Demo — só nome, SEM e-mail (o e-mail da vitrine é privado). Vale só
 * para EXIBIÇÃO: internamente cada cópia mantém o e-mail único `demo_<uuid>@...`.
 */
// i18n-ignore: identidade de marca (nome da conta demo) — igual nos 3 idiomas por decisão do dono (D6), não é copy de UI traduzível.
export const DEMO_DISPLAY_NAME = "WISEVEO Demo"

export function withDemoDisplayIdentity<T extends { name?: string | null }>(
  user: T
): T {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") return user
  return { ...user, name: DEMO_DISPLAY_NAME }
}
