/**
 * Utilitários puros (sem React, sem Node) para a URL de conexão Postgres do
 * Setup Wizard. Compartilhados entre o navegador (montar a URL com a senha
 * digitada, detectar provedor) e o servidor (redigir segredos em logs).
 *
 * `new URL()` NÃO serve para montar a senha: o setter de `password` não
 * codifica `%`, e o `pg` decodifica a userinfo com decodeURIComponent —
 * uma senha com `%` cru quebraria. Por isso o parser é manual e a senha
 * entra sempre via encodeURIComponent.
 */

export type DbProvider = "supabase-direct" | "supabase-pooler" | "neon" | "other"

export interface ParsedConnectionUrl {
  protocol: string
  /** Segmento cru (ainda codificado) do usuário; "" quando ausente. */
  user: string
  /** Segmento cru da senha; `null` quando não há `:` na userinfo. */
  password: string | null
  host: string
  port: string | null
  database: string
  /** Inclui o `?` inicial; "" quando não há query. */
  search: string
}

// i18n-ignore: URLs de painéis externos — dado, não texto de UI.
export const PROVIDER_LINKS = {
  supabaseSignUp: "https://supabase.com/dashboard/sign-up",
  supabaseTokens: "https://supabase.com/dashboard/account/tokens",
  /** Abre o último projeto usado já com o diálogo Connect na aba Transaction pooler. */
  supabaseConnect: "https://supabase.com/dashboard/project/_?showConnect=true&method=transaction",
  supabaseResetPassword: "https://supabase.com/dashboard/project/_/settings/database",
  supabaseDashboard: "https://supabase.com/dashboard/projects",
  neonProjects: "https://console.neon.tech/app/projects",
} as const

const PASSWORD_PLACEHOLDER = /^\[?<?(YOUR[-_ ]?PASSWORD|PASSWORD|SENHA)>?\]?$/i

/** Limpa colagens: aspas, espaços e quebras de linha (URLs de conexão nunca os contêm). */
export function normalizeConnectionUrl(raw: string): string {
  return raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, "")
}

export function parseConnectionUrl(url: string): ParsedConnectionUrl | null {
  const schemeMatch = url.match(/^(postgres(?:ql)?):\/\//i)
  if (!schemeMatch) return null
  const protocol = schemeMatch[1].toLowerCase()
  const rest = url.slice(schemeMatch[0].length)

  // Autoridade termina no primeiro "/" ou "?" (path/query nunca contêm "@" legítimo).
  const endOfAuthority = rest.search(/[/?#]/)
  const authority = endOfAuthority === -1 ? rest : rest.slice(0, endOfAuthority)
  const pathAndQuery = endOfAuthority === -1 ? "" : rest.slice(endOfAuthority)
  if (!authority) return null

  // Último "@" separa userinfo de host: senhas coladas cruas podem conter "@".
  const at = authority.lastIndexOf("@")
  const userinfo = at === -1 ? "" : authority.slice(0, at)
  const hostport = at === -1 ? authority : authority.slice(at + 1)

  let user = ""
  let password: string | null = null
  if (userinfo) {
    const colon = userinfo.indexOf(":")
    if (colon === -1) {
      user = userinfo
    } else {
      user = userinfo.slice(0, colon)
      password = userinfo.slice(colon + 1)
    }
  }

  let host = ""
  let port: string | null = null
  if (hostport.startsWith("[")) {
    const close = hostport.indexOf("]")
    if (close === -1) return null
    host = hostport.slice(0, close + 1)
    const after = hostport.slice(close + 1)
    if (after.startsWith(":")) port = after.slice(1)
  } else {
    const colon = hostport.lastIndexOf(":")
    if (colon === -1) {
      host = hostport
    } else {
      host = hostport.slice(0, colon)
      port = hostport.slice(colon + 1)
    }
  }
  if (!host) return null
  if (port !== null && !/^\d+$/.test(port)) return null

  const q = pathAndQuery.indexOf("?")
  const hash = pathAndQuery.indexOf("#")
  const pathEnd = [q, hash].filter((i) => i !== -1).sort((a, b) => a - b)[0] ?? pathAndQuery.length
  const database = pathAndQuery.slice(0, pathEnd).replace(/^\//, "")
  const search = q === -1 ? "" : pathAndQuery.slice(q, hash === -1 || hash < q ? undefined : hash)

  return { protocol, user, password, host, port, database, search }
}

/** URL colada "do jeito que veio" (com `[YOUR-PASSWORD]`) ou sem senha nenhuma. */
export function hasPasswordPlaceholder(url: string): boolean {
  const parsed = parseConnectionUrl(url)
  if (!parsed) return false
  if (parsed.password === null || parsed.password === "") return true
  return PASSWORD_PLACEHOLDER.test(safeDecode(parsed.password))
}

/**
 * Insere/substitui a senha (codificada) na URL. Sem senha, devolve a URL
 * normalizada como está — quem colou uma URL já completa não é tocado.
 */
export function buildConnectionUrl(url: string, password?: string | null): string {
  const normalized = normalizeConnectionUrl(url)
  if (!password) return normalized
  const parsed = parseConnectionUrl(normalized)
  if (!parsed) return normalized
  const user = parsed.user || "postgres"
  const portPart = parsed.port ? `:${parsed.port}` : ""
  return `${parsed.protocol}://${user}:${encodeURIComponent(password)}@${parsed.host}${portPart}/${parsed.database}${parsed.search}`
}

/** Monta a URL a partir das partes (fluxo com token: dados do pooler + senha gerada). */
export function composeConnectionUrl(parts: {
  user: string
  password: string
  host: string
  port: number | string
  database: string
}): string {
  return `postgresql://${parts.user}:${encodeURIComponent(parts.password)}@${parts.host}:${parts.port}/${parts.database}`
}

export function detectProvider(host: string): DbProvider {
  const h = host.toLowerCase()
  if (/^db\.[a-z0-9]+\.supabase\.co$/.test(h)) return "supabase-direct"
  if (/\.pooler\.supabase\.com$/.test(h)) return "supabase-pooler"
  if (/\.neon\.tech$/.test(h)) return "neon"
  return "other"
}

export function detectProviderFromUrl(url: string): DbProvider {
  const parsed = parseConnectionUrl(normalizeConnectionUrl(url))
  return parsed ? detectProvider(parsed.host) : "other"
}

/** Troca `user:senha@` por `user:***@` em qualquer texto (logs, mensagens de erro). */
export function redactConnectionUrl(text: string): string {
  return text.replace(/(postgres(?:ql)?:\/\/[^:/\s@]*:)[^@\s]*@/gi, "$1***@")
}

const PASSWORD_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_" // 64 chars

/**
 * Senha forte para o banco criado pelo wizard: só caracteres URL-safe, então
 * nunca precisa de codificação e não sofre com `%`/`@` em nenhum consumidor.
 */
export function generateDbPassword(length = 32): string {
  const bytes = new Uint8Array(length)
  globalThis.crypto.getRandomValues(bytes)
  let out = ""
  for (const b of bytes) out += PASSWORD_ALPHABET[b & 63]
  return out
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
