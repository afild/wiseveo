/**
 * Um único embrulho de window.fetch para TODOS os interceptadores (vitrine 409, data fechada 423).
 * Não há cliente central de fetch no app (dezenas de chamadas cruas), por isso o embrulho. Instalar
 * uma vez; remover um handler só tira ele da lista, nunca restaura window.fetch (o cleanup cego do
 * DemoWriteGuard antigo apagava o outro embrulho).
 */
export type FetchArgs = [RequestInfo | URL, RequestInit | undefined]

export interface InterceptorTools {
  /** Repete a requisição SEM passar pelos handlers (é a repetição com o token). */
  retry: (args: FetchArgs) => Promise<Response>
}

export interface FetchInterceptor {
  before?: (args: FetchArgs) => FetchArgs
  /**
   * CONTRATO: inspecione a resposta SEMPRE por `res.clone()`. O corpo só pode ser lido uma vez e
   * quem chamou o fetch ainda vai lê-lo; ler o original direto (`res.json()`) deixa o chamador com
   * "TypeError: Body is unusable". Devolva `null` para deixar a resposta seguir intacta, ou uma
   * outra Response para substituí-la (e aí os handlers seguintes nem rodam).
   */
  after?: (response: Response, args: FetchArgs, tools: InterceptorTools) => Promise<Response | null>
}

/**
 * Ordem dos handlers no host (menor roda primeiro; o padrão de `install` é 100).
 *
 * A cerca da vitrine tem que ser SEMPRE a primeira: ela é quem vê o 409 e abre a janela de "crie
 * sua cópia". Um handler registrado antes dela poderia devolver outra resposta no lugar do 409 e
 * o popup da vitrine nunca apareceria.
 */
export const DEMO_FENCE_ORDER = 10
/** Trava de data fechada: roda depois da cerca da vitrine (na vitrine o 409 vem antes de qualquer 423). */
export const DATE_CLOSING_ORDER = 20

interface Host {
  install: (interceptor: FetchInterceptor, order?: number) => () => void
}

export function createInterceptorHost(target: { fetch: typeof fetch }): Host {
  const original = target.fetch.bind(target)
  const handlers: Array<{ id: number; order: number; interceptor: FetchInterceptor }> = []
  let nextId = 0
  const tools: InterceptorTools = { retry: (args) => original(...args) }

  target.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    let args: FetchArgs = [input, init]
    // Os dois laços percorrem uma CÓPIA da lista. Iterar a lista viva pula handler: o `after` do
    // fechamento de datas fica minutos esperando a pessoa digitar o PIN, e se o componente dele
    // (ou o da vitrine) desmontar nesse meio-tempo o splice do cleanup desloca os índices e o
    // handler seguinte nunca roda. A cópia do `after` é tirada só depois da resposta, então quem
    // saiu antes de a rede voltar continua fora.
    for (const h of handlers.slice()) if (h.interceptor.before) args = h.interceptor.before(args)
    const response = await original(...args)
    for (const h of handlers.slice()) {
      if (!h.interceptor.after) continue
      const replaced = await h.interceptor.after(response, args, tools)
      if (replaced) return replaced
    }
    return response
  }) as typeof fetch

  return {
    install(interceptor, order = 100) {
      const id = nextId++
      handlers.push({ id, order, interceptor })
      handlers.sort((a, b) => a.order - b.order)
      return () => {
        const index = handlers.findIndex((h) => h.id === id)
        if (index >= 0) handlers.splice(index, 1)
      }
    },
  }
}

let browserHost: Host | null = null

/** Host do navegador (criado na primeira instalação). Em SSR devolve um no-op. */
export function installFetchInterceptor(interceptor: FetchInterceptor, order = 100): () => void {
  if (typeof window === "undefined") return () => {}
  if (!browserHost) browserHost = createInterceptorHost(window)
  return browserHost.install(interceptor, order)
}

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

/** Mesma origem, /api/, método de escrita, args[0] string/URL, corpo ausente/string/FormData/URLSearchParams/Blob. */
export function isEligibleWrite(
  args: FetchArgs,
  origin: string = typeof window !== "undefined" ? window.location.origin : "",
): boolean {
  const [input, init] = args
  // Sem origem utilizável (SSR, sem window) nada é elegível — e `new URL("/api/x", "")` LANÇA
  // em vez de devolver falso.
  if (!origin) return false
  if (!(typeof input === "string" || input instanceof URL)) return false
  const url = new URL(String(input), origin)
  if (url.origin !== origin || !url.pathname.startsWith("/api/")) return false
  const method = (init?.method ?? "GET").toUpperCase()
  if (!WRITE_METHODS.has(method)) return false
  const body = init?.body
  if (body === undefined || body === null || typeof body === "string") return true
  if (typeof FormData !== "undefined" && body instanceof FormData) return true
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) return true
  if (typeof Blob !== "undefined" && body instanceof Blob) return true
  return false
}

export function withHeader(args: FetchArgs, name: string, value: string): FetchArgs {
  const [input, init] = args
  const headers = new Headers(init?.headers)
  headers.set(name, value)
  return [input, { ...(init ?? {}), headers }]
}
