/**
 * Cadastro público ("Criar conta" na página de login e /signup).
 * Padrão: ligado (self-host aberto, com aprovação de novos usuários).
 * Instância privada (ex.: app.wiseveo.com — só o dono e convidados):
 * `WISEVEO_PUBLIC_SIGNUP=false` → some a aba e a rota de cadastro; só o
 * convite (a implementar) cria usuários.
 */
export function isPublicSignupEnabled(): boolean {
  return process.env.WISEVEO_PUBLIC_SIGNUP !== "false"
}
