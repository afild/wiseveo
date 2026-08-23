/**
 * Chave que assina o "crachá" da sessão (cookie) e o cookie de identidade do Setup.
 *
 * Ela NÃO precisa mais existir como variável de ambiente: por padrão é calculada a
 * partir da própria `DATABASE_URL` (SHA-256 sobre um rótulo fixo + a URL). Quem tem
 * a URL do banco já tem os dados, então derivar dela não abre brecha nova — e some
 * uma variável que a pessoa teria de colar no painel da hospedagem.
 *
 * Ordem: `AUTH_SECRET` (se a instalação já tiver uma) → `DATABASE_URL` → fallback de
 * desenvolvimento. Instalações antigas continuam valendo, porque a env vence.
 *
 * Consequência conhecida: trocar a senha do banco muda a chave e derruba as sessões
 * abertas (todo mundo entra de novo).
 *
 * Web Crypto (não `node:crypto`): este módulo é alcançado pelo middleware.
 */

const DERIVATION_LABEL = "wiseveo-session-key-v1"
const DEV_FALLBACK = "fallback-secret-change-me"

/** O que a chave assina hoje: env explícita → URL do banco → fallback de dev. */
export function sessionSecretSource(env: NodeJS.ProcessEnv = process.env): string {
  return env.AUTH_SECRET || env.DATABASE_URL || DEV_FALLBACK
}

/** Chave de 32 bytes a partir de um segredo qualquer (URL do banco, AUTH_SECRET…). */
export async function deriveSessionKey(source: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(`${DERIVATION_LABEL}:${source}`)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return new Uint8Array(digest)
}

let cache: { source: string; key: Uint8Array } | null = null

/** Chave em vigor nesta instalação (memorizada enquanto a origem não mudar). */
export async function getSessionKey(env: NodeJS.ProcessEnv = process.env): Promise<Uint8Array> {
  const source = sessionSecretSource(env)
  if (cache?.source !== source) {
    cache = { source, key: await deriveSessionKey(source) }
  }
  return cache.key
}

/**
 * Chave que VAI valer depois que o Setup terminar (a URL do banco recém-conectada).
 * É com ela que o Finalizar assina a sessão do administrador — assim o crachá já
 * nasce válido para depois do reinício/redeploy e a pessoa cai no dashboard logada.
 */
export function futureSessionSource(databaseUrl: string, env: NodeJS.ProcessEnv = process.env): string {
  return env.AUTH_SECRET || databaseUrl
}
