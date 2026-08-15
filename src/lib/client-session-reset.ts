// WISEVEO — Reset de estado persistido no navegador ao nascer uma sessão nova.
//
// Cenário: o provisionamento DEMO cria um usuário novo, mas o navegador é o mesmo
// do visitante anterior — e o período/filtros ficam em localStorage (por navegador,
// não por usuário). Sem reset, o novo demo herda o mês antigo e filtros de texto
// que escondem dados. A rota de provisionamento grava um cookie-marcador curto,
// legível por JS; o cliente o consome UMA vez e limpa as chaves abaixo.
//
// Só o provisionamento demo grava o marcador → o app nunca sofre reset.

/** Cookie (não httpOnly) gravado por /api/demo/provision. Consumido no primeiro mount. */
export const FRESH_SESSION_COOKIE = "wiseveo-fresh-session"

/** Prefixos/chaves de localStorage apagados numa sessão nova. */
const PURGED_KEY_PREFIXES = [
  "wiseveo-date-filters", // períodos por rota (+ chave legada sem sufixo)
] as const

// Filtros que ESCONDEM linhas e o cache da moeda (dado por usuário, vindo do servidor —
// o demo novo nasce em USD e não deve piscar a moeda do visitante anterior). Layout
// (visibilidade/largura/ordem de colunas) e tema ficam — só acomodam o usuário novo.
const PURGED_KEYS = [
  "wiseveo-table-global-filter", // busca livre da tabela de transações (casa com datas formatadas)
  "wiseveo-table-filters-v2", // filtros de status/tipo/conta da tabela de transações
  "wiseveo-recurring-filters-v2", // busca por descrição + tipo/status/conta da tabela de recorrentes
  "wiseveo-monetary-preferences", // cache local das preferências monetárias (o servidor é a fonte)
] as const

/** Storage mínimo para permitir teste em node sem jsdom. */
export interface KeyValueStorage {
  readonly length: number
  key(index: number): string | null
  removeItem(key: string): void
}

export function shouldPurgeKey(key: string): boolean {
  if ((PURGED_KEYS as readonly string[]).includes(key)) return true
  return PURGED_KEY_PREFIXES.some((prefix) => key === prefix || key.startsWith(`${prefix}:`))
}

/** Remove do storage as chaves de período/filtros. Devolve as chaves removidas. */
export function purgePersistedFilters(storage: KeyValueStorage): string[] {
  const doomed: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (key && shouldPurgeKey(key)) doomed.push(key)
  }
  for (const key of doomed) storage.removeItem(key)
  return doomed
}

/**
 * Lê e apaga o cookie-marcador. `true` = esta é a primeira carga de uma sessão nova.
 * Idempotente: a segunda chamada devolve `false`.
 */
export function consumeFreshSessionMarker(): boolean {
  if (typeof document === "undefined") return false
  const present = document.cookie
    .split(";")
    .some((part) => part.trim().startsWith(`${FRESH_SESSION_COOKIE}=`))
  if (!present) return false
  document.cookie = `${FRESH_SESSION_COOKIE}=; path=/; max-age=0; SameSite=Lax`
  return true
}
