/**
 * Endereço público do app (para links absolutos e redirect_uri do OAuth).
 * Ordem: NEXT_PUBLIC_APP_URL (explícito) → origem da requisição atual (o host
 * que a pessoa está usando, ex.: https://app.wiseveo.com) → domínio de produção
 * da Vercel → localhost. Assim o login com Google funciona na Vercel só com
 * GOOGLE_CLIENT_ID/SECRET, sem a pessoa precisar definir NEXT_PUBLIC_APP_URL.
 */
export function getAppUrl(request?: Request | { url: string } | null): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, "")

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
