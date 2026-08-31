// WISEVEO — Modo "vitrine" da demo: a sessão compartilhada enxerga o usuário-vitrine e
// NÃO pode escrever.

/** Caminho da rota que cria a cópia editável (tira a pessoa da vitrine). */
export const DEMO_FORK_PATH = "/api/demo/fork"
/** Cookie NÃO-httpOnly que o cliente lê para mostrar o banner. Só sinalização. */
export const DEMO_SHARED_MARKER_COOKIE = "wiseveo-demo-shared"

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])
// fork: é a rota que TIRA a pessoa da vitrine. logout: só apaga o cookie (não grava
// no banco) — sem ele o visitante ficaria preso.
const SHARED_WRITE_ALLOWLIST = new Set<string>([DEMO_FORK_PATH, "/api/auth/logout"])

/**
 * A decisão é por MÉTODO + claim (não por lista de rotas) de propósito: cobre as rotas
 * /api E as server actions de orçamento, que POSTam na própria página e nunca
 * passariam por uma lista de /api.
 *
 * `pathname` tem de ser `request.nextUrl.pathname`: sem query, sem host e sem
 * prefixo de idioma (`localePrefix: "never"`). A comparação com a allowlist é
 * EXATA de propósito — barra no fim, maiúscula ou sufixo caem no bloqueio (erra
 * para o lado seguro; se o fork parar de passar, é isto).
 * "Escrita" aqui é o MÉTODO: rota GET que grava (cron, provisionamento) não é
 * coberta por esta cerca e precisa da própria trava.
 */
export function isBlockedSharedWrite(
  method: string,
  pathname: string,
  demoShared: boolean | undefined,
): boolean {
  if (!demoShared) return false
  if (!WRITE_METHODS.has(method.toUpperCase())) return false
  return !SHARED_WRITE_ALLOWLIST.has(pathname)
}
