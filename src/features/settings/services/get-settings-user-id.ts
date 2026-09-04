import { getDefaultUserId } from "@/features/transactions/services/get-default-user-id"
import { getSessionUserId } from "@/lib/session"

/**
 * SÓ LEITURA. Pessoa da sessão e, sem sessão, o resolvedor de leitura, que em produção devolve
 * null e fora de produção cai no usuário mais antigo do banco (páginas renderizadas no servidor
 * e os GET de preferências dependem disso em desenvolvimento).
 *
 * Rota que GRAVA dados da pessoa nunca passa por aqui: usa getSessionUserId direto e responde
 * 401 sem sessão. A catraca em tests/security/settings-write-session.test.ts impede a volta.
 */
export async function getSettingsUserId() {
  const sessionUserId = await getSessionUserId()
  if (sessionUserId) {
    return sessionUserId
  }

  return getDefaultUserId()
}
