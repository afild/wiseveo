type HeaderBag = { get(name: string): string | null }

/** Qualquer coisa com `url` e/ou `headers` (Request, NextRequest ou um objeto simples). */
export type AppUrlSource = Request | { url?: string; headers?: HeaderBag | null } | null | undefined

/** Rede local: localhost, loopback e faixas privadas IPv4 — únicos hosts onde http é aceitável. */
const LOCAL_HOST_RE =
  /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/i

/**
 * Origem a partir dos cabeçalhos do pedido: x-forwarded-host (proxy) → host.
 * Esquema: fora da rede local é SEMPRE https — o Next preenche x-forwarded-proto
 * com o valor do proxy ou, na falta dele, com o esquema do socket, então atrás
 * de um proxy TLS que não repassa o esquema viria "http" (e o Google nem aceita
 * http como redirect_uri fora de localhost). Na rede local vale o que o proxy
 * disser, senão http.
 */
function originFromHeaders(headers: HeaderBag | null | undefined): string {
  const first = (value: string | null | undefined) => value?.split(",")[0]?.trim() ?? ""
  const host = first(headers?.get("x-forwarded-host")) || first(headers?.get("host"))
  if (!host) return ""
  const isLocal = LOCAL_HOST_RE.test(host)
  const proto = isLocal ? first(headers?.get("x-forwarded-proto")) || "http" : "https"
  return `${proto}://${host}`
}

/**
 * Endereço público do app (para links absolutos e redirect_uri do OAuth).
 * Ordem: NEXT_PUBLIC_APP_URL (explícito) → cabeçalhos do pedido (o host que a
 * pessoa está usando, ex.: https://app.wiseveo.com — vale na Vercel, em
 * `next start` atrás de proxy e em dev) → `request.url` → domínio de produção
 * da Vercel → localhost. Assim o login com Google funciona só com
 * GOOGLE_CLIENT_ID/SECRET, sem a pessoa precisar definir NEXT_PUBLIC_APP_URL.
 *
 * Os cabeçalhos vêm ANTES de `request.url` de propósito: fora da Vercel o Next
 * monta `request.url` com o endereço em que o servidor escuta (localhost:porta),
 * não com o host pedido — e o guia "Ative o login com Google" precisa mostrar
 * exatamente o endereço que estas rotas vão mandar ao Google.
 */
export function getAppUrl(request?: AppUrlSource): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, "")

  const fromHeaders = originFromHeaders(request?.headers)
  if (fromHeaders) return fromHeaders

  if (request?.url) {
    try {
      const origin = new URL(request.url).origin
      if (origin && origin !== "null") return origin
    } catch {
      // cai nos padrões abaixo
    }
  }

  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (vercelProd) return `https://${vercelProd.replace(/\/+$/, "")}`

  return "http://localhost:3000"
}

/** Para server components (ex.: página de login), que não recebem `request`: `headers()` do next/headers. */
export function getAppUrlFromHeaders(headers: HeaderBag | null | undefined): string {
  return getAppUrl({ headers })
}
