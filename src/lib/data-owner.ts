/**
 * Dono dos dados financeiros de uma requisição.
 *
 * O banco do dono é a fonte da verdade e NÃO tem coluna de dono (`data_owner_id`):
 * cada usuário é dono de si mesmo. Esta função existe como ponto único de troca —
 * quando os convites forem implementados (com a mudança estrutural feita pelo app,
 * com o sistema já em uso), só ela passa a consultar quem convidou quem.
 *
 * Use em TUDO que é dado financeiro (transações, contas, orçamento, dashboard,
 * plano de contas…). Perfil, preferências, tema, idioma e integrações continuam
 * por usuário real (getSessionUserId / getSettingsUserId).
 */
export async function resolveDataOwnerId(userId: string): Promise<string> {
  return userId
}
