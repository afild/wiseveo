import fs from "node:fs"
import { Client } from "pg"

/**
 * FAXINA MANUAL DOS VISITANTES DA DEMO — libera a escrita e apaga o que venceu.
 *
 * Uso: npx tsx --env-file=.env.local scripts/clean-demo-visitors.ts
 *
 * Existe porque a faxina automática (`/api/cron/cleanup-demo`) só alcança a fila
 * do dia a dia; quando ela já cresceu a ponto de o Supabase pôr o banco em
 * SOMENTE LEITURA, nem apagar funciona mais — e o desbloqueio é por sessão, o
 * que uma rota HTTP não consegue sustentar. Este script faz as duas coisas na
 * mesma conexão. Pode ser interrompido e rodado de novo: ele retoma pelo que
 * ainda existe.
 *
 * TRÊS COISAS QUE ESTE ARQUIVO APRENDEU NA MARRA:
 *
 * 1. A ORDEM. Apagar o usuário e deixar a cascata resolver levava mais de 20
 *    minutos para 25 visitantes: `categories` e `recurring_transactions` não têm
 *    índice por `user_id`, então cada categoria apagada varria a tabela de 3
 *    milhões de transações. Apagando as TRANSAÇÕES primeiro, pelo índice
 *    `(user_id, DATA)`, o mesmo trabalho leva 6 segundos por lote de 100 mil.
 *
 * 2. A CONEXÃO. O host direto do Supabase só resolve para IPv6; o caminho é o
 *    pooler em modo SESSÃO (porta 5432). No modo transação (6543) o desbloqueio,
 *    que é por sessão, se perderia entre um comando e o outro.
 *
 * 3. A QUEDA. O pooler derruba a conexão sem avisar no meio de um trabalho
 *    longo. Como cada lote é confirmado sozinho, dá para reconectar, reaplicar o
 *    desbloqueio e continuar de onde parou — é o que o laço abaixo faz.
 *
 * Trava dupla, a mesma da faxina do app: e-mail começando com "demo_" E mais de
 * 25 horas de vida. Nenhum usuário real entra na lista, e o script aborta se a
 * contagem deles mudar.
 */

const LOG = "clean-demo-visitors.log"
const registrar = (linha: string) => {
  // Arquivo, e não só a tela: a saída do processo fica em buffer quando vai para
  // um cano, e o progresso precisa ser visível enquanto ele roda.
  fs.appendFileSync(LOG, `${new Date().toISOString().slice(11, 19)} ${linha}\n`)
  console.log(linha)
}

const ALVO = `email LIKE 'demo\\_%' ESCAPE '\\' AND created_at < NOW() - INTERVAL '25 hours'`
const REAIS = `email NOT LIKE 'demo\\_%' ESCAPE '\\'`
const LOTE = 40

const pooled = process.env.DATABASE_URL
if (!pooled) throw new Error("DATABASE_URL ausente")
const url = new URL(pooled)
url.port = "5432"
url.search = ""

const refDemo = process.env.DEMO_DB_REF?.replace(/"/g, "")
if (!refDemo || !url.username.includes(refDemo)) {
  throw new Error("a conexão não aponta para o projeto da DEMO — abortando")
}

let client: Client | null = null

async function conectar(): Promise<Client> {
  const c = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 30000, keepAlive: true })
  // Sem este ouvinte, uma queda vira exceção não tratada e mata o processo.
  c.on("error", () => {})
  await c.connect()
  await c.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE")
  await c.query("SET default_transaction_read_only = 'off'")
  await c.query("SET statement_timeout = 0")
  return c
}

/** Executa reconectando quando o pooler derruba. Cada lote já foi confirmado. */
async function executar<T>(fn: (c: Client) => Promise<T>, tentativas = 4): Promise<T> {
  for (let i = 1; i <= tentativas; i += 1) {
    try {
      if (!client) client = await conectar()
      return await fn(client)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      if (i === tentativas) throw error
      registrar(`  (reconectando após: ${msg.slice(0, 60)})`)
      try { await (client as Client | null)?.end() } catch { /* já caiu */ }
      client = null
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
  throw new Error("inalcançável")
}

const contar = (where: string) =>
  executar(async (c) => Number((await c.query(`SELECT COUNT(*)::bigint AS n FROM users WHERE ${where}`)).rows[0].n))

const reaisAntes = await contar(REAIS)
registrar(`retomando — vencidos: ${await contar(ALVO)} | usuários reais (intocáveis): ${reaisAntes}`)

// --- 1) transações primeiro, pelo índice ------------------------------------
let ciclo = 0
for (;;) {
  const ids = await executar(async (c) =>
    (await c.query<{ id: string }>(
      `SELECT u.id FROM users u WHERE ${ALVO}
         AND EXISTS (SELECT 1 FROM transactions t WHERE t.user_id = u.id)
       LIMIT ${LOTE}`,
    )).rows.map((r) => r.id),
  )
  if (ids.length === 0) break
  const t0 = Date.now()
  const n = await executar(async (c) => (await c.query(`DELETE FROM transactions WHERE user_id = ANY($1)`, [ids])).rowCount ?? 0)
  ciclo += 1
  registrar(`transações: ciclo ${ciclo} — ${n} linhas de ${ids.length} visitantes em ${((Date.now() - t0) / 1000).toFixed(1)}s`)
}
registrar("transações dos vencidos: zeradas")

// --- 2) agora os usuários; a cascata do resto ficou barata -------------------
let apagados = 0
for (;;) {
  const ids = await executar(async (c) =>
    (await c.query<{ id: string }>(`SELECT id FROM users WHERE ${ALVO} LIMIT ${LOTE}`)).rows.map((r) => r.id),
  )
  if (ids.length === 0) break
  const t0 = Date.now()
  const n = await executar(async (c) => (await c.query(`DELETE FROM users WHERE id = ANY($1)`, [ids])).rowCount ?? 0)
  apagados += n
  registrar(`usuários: ${apagados} apagados (lote de ${n} em ${((Date.now() - t0) / 1000).toFixed(1)}s)`)
}

const reaisDepois = await contar(REAIS)
if (reaisDepois !== reaisAntes) throw new Error("PARE: a contagem de usuários reais mudou")
registrar(`usuários reais intactos: ${reaisDepois}`)

registrar("recuperando espaço (vacuum)…")
await executar(async (c) => c.query("VACUUM"))

const final = await executar(async (c) => ({
  tamanho: (await c.query("SELECT pg_size_pretty(pg_database_size(current_database())) AS s")).rows[0].s,
  transacoes: (await c.query("SELECT COUNT(*)::bigint AS n FROM transactions")).rows[0].n,
  leitura: (await c.query("SHOW default_transaction_read_only")).rows[0].default_transaction_read_only,
}))
registrar(`tamanho final: ${final.tamanho} | transações: ${final.transacoes} | somente leitura na sessão: ${final.leitura}`)

await (client as unknown as Client | null)?.end()
