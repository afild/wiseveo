import { Client } from "pg"

/**
 * VIGIA DO BANCO DA DEMO — espera o Postgres voltar a aceitar conexão.
 *
 * Uso: npx tsx --env-file=.env.local scripts/wait-demo-db.ts [minutos]
 *
 * Existe porque restaurar um projeto pausado no Supabase leva minutos sem aviso,
 * e a janela útil logo depois é curta: se o banco voltar já perto do limite de
 * espaço, ele entra em somente leitura de novo em pouco tempo. Este script fica
 * batendo na porta e sai no primeiro "sim", para a recuperação começar na hora.
 */

const minutos = Number(process.argv[2] ?? 40)
const INTERVALO_MS = 20_000

const pooled = process.env.DATABASE_URL
if (!pooled) throw new Error("DATABASE_URL ausente")
const url = new URL(pooled)
url.port = "5432"
url.search = ""

const refDemo = process.env.DEMO_DB_REF?.replace(/"/g, "")
if (!refDemo || !url.username.includes(refDemo)) {
  throw new Error("a conexão não aponta para o projeto da DEMO — abortando")
}

const carimbo = () => new Date().toISOString().slice(11, 19)

async function tentar(): Promise<string | null> {
  const c = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 15000 })
  c.on("error", () => {})
  try {
    await c.connect()
    const tamanho = (await c.query("SELECT pg_size_pretty(pg_database_size(current_database())) AS s")).rows[0].s
    const leitura = (await c.query("SHOW default_transaction_read_only")).rows[0].default_transaction_read_only
    return `tamanho ${tamanho} | somente leitura: ${leitura}`
  } catch {
    return null
  } finally {
    try {
      await c.end()
    } catch {
      /* já caiu */
    }
  }
}

async function main() {
  const limite = Date.now() + minutos * 60_000
  let tentativas = 0
  for (;;) {
    tentativas += 1
    const ok = await tentar()
    if (ok) {
      console.log(`${carimbo()} BANCO NO AR (tentativa ${tentativas}) — ${ok}`)
      return
    }
    if (Date.now() > limite) {
      console.log(`${carimbo()} desisti após ${minutos} min e ${tentativas} tentativas — o banco não voltou.`)
      process.exitCode = 1
      return
    }
    await new Promise((r) => setTimeout(r, INTERVALO_MS))
  }
}

main()
