/**
 * Modo "vitrine" da demo: a sessão compartilhada enxerga o usuário-vitrine e
 * NÃO pode escrever. A decisão é por MÉTODO + claim (não por lista de rotas)
 * de propósito: cobre as rotas /api E as server actions de orçamento, que
 * POSTam na própria página e nunca passariam por uma lista de /api.
 */
export const DEMO_FORK_PATH = "/api/demo/fork"
/** Cookie NÃO-httpOnly que o cliente lê para mostrar o banner. Só sinalização. */
export const DEMO_SHARED_MARKER_COOKIE = "wiseveo-demo-shared"

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])
const SHARED_WRITE_ALLOWLIST = new Set<string>([DEMO_FORK_PATH, "/api/auth/logout"])

export function isBlockedSharedWrite(
  method: string,
  pathname: string,
  demoShared: boolean | undefined,
): boolean {
  if (!demoShared) return false
  if (!WRITE_METHODS.has(method.toUpperCase())) return false
  return !SHARED_WRITE_ALLOWLIST.has(pathname)
}
