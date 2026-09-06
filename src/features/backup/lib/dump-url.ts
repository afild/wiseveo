/**
 * Qual endereço o `pg_dump` usa, e como ele vira variáveis de ambiente.
 *
 * Três fatos mandam aqui:
 *  1. o transaction pooler do Supabase (porta 6543, `pgbouncer=true`) NÃO serve para
 *     pg_dump; o session pooler (mesmo host, porta 5432) serve;
 *  2. o endereço direto (`db.<ref>.supabase.co`) é só IPv6, e se o Sandbox alcança ou
 *     não é decidido pela prova da Task 1 (constante abaixo);
 *  3. a URL nunca vai na linha de comando do Sandbox: vai quebrada em PG*, por env.
 */

/**
 * Resultado da Task 1 (05/09/2026, contra a DEMO): o Sandbox não tem saída IPv6, o
 * endereço direto falhou com "Network is unreachable" e o session pooler respondeu
 * (pg_dump em 3,7 s, ciclo inteiro em 19,8 s). Por isso false: o dump vai pelo pooler.
 */
export const SANDBOX_PREFERS_DIRECT = false

/**
 * Só o que esta função lê do ambiente. Estreito de propósito: quem chama monta objetos
 * mínimos sem precisar carregar NODE_ENV junto (o Next aumenta `NodeJS.ProcessEnv` com
 * NODE_ENV obrigatório e sem `?`).
 *
 * A assinatura de índice não é enfeite: sem ela, um tipo de propriedades todas opcionais
 * é "fraco" para o TypeScript, e `process.env` deixa de ser atribuível com o erro
 * TS2559 ("no properties in common"). Com ela, `process.env` passa e os testes continuam
 * montando objetos mínimos.
 */
export interface DumpUrlEnv {
  DATABASE_URL?: string
  DIRECT_URL?: string
  [key: string]: string | undefined
}

export function resolveDumpUrl(env: DumpUrlEnv, preferDirect: boolean = SANDBOX_PREFERS_DIRECT): string {
  if (preferDirect && env.DIRECT_URL) return env.DIRECT_URL
  const base = env.DATABASE_URL
  if (!base) throw new Error("DATABASE_URL ausente") // i18n-ignore: erro interno
  const url = new URL(base)
  if (url.hostname.endsWith("pooler.supabase.com") && url.port === "6543") {
    url.port = "5432"
    url.searchParams.delete("pgbouncer")
  }
  return url.toString().replace(/\?$/, "")
}

export interface PgEnv {
  PGHOST: string
  PGPORT: string
  PGUSER: string
  PGPASSWORD: string
  PGDATABASE: string
}

export function pgEnvFromUrl(databaseUrl: string): PgEnv {
  const url = new URL(databaseUrl)
  return {
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: url.pathname.replace(/^\//, "") || "postgres",
  }
}
