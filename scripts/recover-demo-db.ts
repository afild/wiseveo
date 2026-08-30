import fs from "node:fs"
import { Client } from "pg"

/**
 * RECUPERAÇÃO DO BANCO DA DEMO — devolve o espaço em disco de verdade.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/recover-demo-db.ts             (só mede)
 *   npx tsx --env-file=.env.local scripts/recover-demo-db.ts --confirmar (executa)
 *
 * POR QUE ESTE ARQUIVO EXISTE, se já há `clean-demo-visitors.ts`:
 *
 * Aquele apaga linha a linha, e isso deixou de funcionar quando o disco chegou a
 * 97%. Três fatos que se somam e fecham as saídas do caminho antigo:
 *
 * 1. `DELETE` NÃO devolve espaço ao disco. A linha vira espaço morto DENTRO do
 *    arquivo da tabela; o arquivo continua do mesmo tamanho. Foi por isso que
 *    apagar 813 mil transações na madrugada de 25/08 não moveu o ponteiro.
 * 2. `VACUUM FULL` devolveria, mas reescrevendo a tabela num arquivo NOVO — ou
 *    seja, precisa de espaço livre para a cópia. Com o disco em 97% ele falha.
 * 3. `DELETE` ainda ESCREVE (WAL e espaço morto). Num disco quase cheio, apagar
 *    pode encher o que sobrou antes de terminar.
 *
 * A única primitiva que devolve espaço SEM precisar de espaço é `TRUNCATE`: ela
 * não varre linhas, só troca o arquivo da tabela por um vazio e apaga o antigo.
 *
 * Como a demo é quase toda descartável e os poucos usuários reais precisam
 * sobreviver, o script faz uma TROCA DE MESA, tudo dentro de UMA transação:
 * guarda as linhas dos donos reais numa mesa auxiliar → TRUNCATE nas tabelas →
 * devolve os guardados → apaga os visitantes.
 *
 * Ser uma transação só é o que torna isto seguro: `TRUNCATE` no Postgres é
 * transacional. Se a conexão cair no meio (o pooler faz isso sem avisar), tudo
 * volta ao que era e nada se perde. O espaço só é devolvido na confirmação.
 *
 * Travas: aborta se a conexão não apontar para o projeto da DEMO; aborta se a
 * contagem de usuários reais mudar; e sem `--confirmar` ele apenas mede.
 */

const LOG = "recover-demo-db.log"
const registrar = (linha: string) => {
  // Arquivo além da tela: a saída fica em buffer quando vai para um cano, e o
  // progresso precisa ser visível enquanto o script roda.
  fs.appendFileSync(LOG, `${new Date().toISOString().slice(11, 19)} ${linha}\n`)
  console.log(linha)
}

const DEMO = "email LIKE 'demo\\_%' ESCAPE '\\'"
const REAIS = "email NOT LIKE 'demo\\_%' ESCAPE '\\'"

/** Acima disto a troca de mesa deixa de ser barata — melhor investigar antes. */
const TETO_GUARDADOS = 300_000

/**
 * As tabelas por dono que a demo enche. A ordem É a ordem de devolução: pai
 * antes de filho, senão a chave estrangeira recusa a linha. O `TRUNCATE` sai com
 * todas juntas num comando só — assim nenhuma fica "referenciada por uma tabela
 * que não está sendo esvaziada", que é como o Postgres recusa o comando.
 */
const TABELAS: Array<{ nome: string; guardar: string }> = [
  { nome: "accounts", guardar: "user_id IN (SELECT id FROM _donos_reais)" },
  { nome: "category_groups", guardar: "user_id IN (SELECT id FROM _donos_reais)" },
  { nome: "categories", guardar: "user_id IN (SELECT id FROM _donos_reais)" },
  { nome: "payees", guardar: "user_id IN (SELECT id FROM _donos_reais)" },
  { nome: "transaction_statuses", guardar: "user_id IN (SELECT id FROM _donos_reais)" },
  { nome: "transactions", guardar: "user_id IN (SELECT id FROM _donos_reais)" },
  // Anexo não tem dono próprio: ele segue a transação a que pertence — e a mesa
  // auxiliar das transações já foi montada acima, por isso a consulta é barata.
  { nome: "transaction_attachments", guardar: "transaction_id IN (SELECT id FROM _guardado_transactions)" },
  { nome: "transaction_messages", guardar: "user_id IN (SELECT id FROM _donos_reais)" },
  { nome: "excluded_transactions", guardar: "user_id IN (SELECT id FROM _donos_reais)" },
  { nome: "recurring_transactions", guardar: "user_id IN (SELECT id FROM _donos_reais)" },
  { nome: "budgets", guardar: "user_id IN (SELECT id FROM _donos_reais)" },
]

const executar = process.argv.includes("--confirmar")

const pooled = process.env.DATABASE_URL
if (!pooled) throw new Error("DATABASE_URL ausente")
const url = new URL(pooled)
// Pooler em modo SESSÃO. O desbloqueio da escrita vale por sessão; no modo
// transação (6543) ele se perderia entre um comando e o outro.
url.port = "5432"
url.search = ""

const refDemo = process.env.DEMO_DB_REF?.replace(/"/g, "")
if (!refDemo || !url.username.includes(refDemo)) {
  throw new Error("a conexão não aponta para o projeto da DEMO — abortando")
}

async function conectar(): Promise<Client> {
  const c = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 30000, keepAlive: true })
  // Sem este ouvinte, uma queda do pooler vira exceção não tratada e mata o processo.
  c.on("error", () => {})
  await c.connect()
  await c.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE")
  await c.query("SET default_transaction_read_only = 'off'")
  await c.query("SET statement_timeout = 0")
  return c
}

async function main() {
  let c: Client
  try {
    c = await conectar()
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    registrar(`banco inacessível: ${msg}`)
    registrar("→ o Postgres da demo não subiu. Reinicie o projeto no painel do Supabase e rode de novo.")
    process.exitCode = 1
    return
  }

  const um = async (sql: string) => (await c.query(sql)).rows[0] as Record<string, string>
  const n = async (sql: string) => Number((await c.query(sql)).rows[0].n)

  const tamanhoAntes = (await um("SELECT pg_size_pretty(pg_database_size(current_database())) AS s")).s
  const somenteLeitura = (await um("SHOW default_transaction_read_only")).default_transaction_read_only
  const reaisAntes = await n(`SELECT COUNT(*)::bigint AS n FROM users WHERE ${REAIS}`)
  const demoAntes = await n(`SELECT COUNT(*)::bigint AS n FROM users WHERE ${DEMO}`)

  registrar(`tamanho: ${tamanhoAntes} | somente leitura nesta sessão: ${somenteLeitura}`)
  registrar(`usuários — reais (intocáveis): ${reaisAntes} | visitantes demo: ${demoAntes}`)

  // Quem sobrevive, por nome: dá para conferir a olho antes de confirmar.
  const donos = await c.query<{ email: string }>(`SELECT email FROM users WHERE ${REAIS} ORDER BY created_at`)
  for (const d of donos.rows) registrar(`  mantém: ${d.email}`)

  registrar("peso por tabela (linhas de dono real / total):")
  let guardadosTotal = 0
  for (const t of TABELAS) {
    const total = await n(`SELECT COUNT(*)::bigint AS n FROM ${t.nome}`)
    const guardar =
      t.nome === "transaction_attachments"
        ? await n(
            `SELECT COUNT(*)::bigint AS n FROM transaction_attachments a
               JOIN transactions t ON t.id = a.transaction_id
              WHERE t.user_id IN (SELECT id FROM users WHERE ${REAIS})`,
          )
        : await n(
            `SELECT COUNT(*)::bigint AS n FROM ${t.nome}
              WHERE user_id IN (SELECT id FROM users WHERE ${REAIS})`,
          )
    guardadosTotal += guardar
    registrar(`  ${t.nome.padEnd(24)} ${String(guardar).padStart(9)} / ${total}`)
  }
  registrar(`total a guardar: ${guardadosTotal} linhas`)

  if (guardadosTotal > TETO_GUARDADOS) {
    registrar(`PARE: ${guardadosTotal} linhas de donos reais é muito para a troca de mesa (teto ${TETO_GUARDADOS}).`)
    await c.end()
    process.exitCode = 1
    return
  }

  if (!executar) {
    registrar("modo medição — nada foi alterado. Rode de novo com --confirmar para executar.")
    await c.end()
    return
  }

  // --- a troca de mesa, tudo numa transação só -------------------------------
  const t0 = Date.now()
  registrar("iniciando a troca de mesa (transação única)…")
  // Distingue "caiu antes de confirmar" (o banco desfaz tudo sozinho) de "caiu
  // DURANTE o COMMIT" (a resposta se perdeu, mas o banco pode ter confirmado).
  let confirmando = false
  try {
    await c.query("BEGIN")

    await c.query(`CREATE TEMP TABLE _donos_reais ON COMMIT DROP AS SELECT id FROM users WHERE ${REAIS}`)
    await c.query("CREATE INDEX ON _donos_reais (id)")

    for (const t of TABELAS) {
      await c.query(
        `CREATE TEMP TABLE _guardado_${t.nome} ON COMMIT DROP AS SELECT * FROM ${t.nome} WHERE ${t.guardar}`,
      )
    }
    registrar(`  guardados em ${((Date.now() - t0) / 1000).toFixed(1)}s`)

    // Um comando só: nenhuma tabela fica referenciada por outra que ficou de fora.
    await c.query(`TRUNCATE ${TABELAS.map((t) => t.nome).join(", ")}`)
    registrar(`  tabelas esvaziadas em ${((Date.now() - t0) / 1000).toFixed(1)}s`)

    for (const t of TABELAS) {
      await c.query(`INSERT INTO ${t.nome} SELECT * FROM _guardado_${t.nome}`)
    }
    registrar(`  devolvidos em ${((Date.now() - t0) / 1000).toFixed(1)}s`)

    // Agora os visitantes não têm mais nada pendurado: a cascata fica barata mesmo
    // sem os índices que faltam em categories e recurring_transactions.
    const apagados = (await c.query(`DELETE FROM users WHERE ${DEMO}`)).rowCount ?? 0

    const reaisDepois = Number((await c.query(`SELECT COUNT(*)::bigint AS n FROM users WHERE ${REAIS}`)).rows[0].n)
    if (reaisDepois !== reaisAntes) {
      // Dentro da transação: desfazer devolve tudo. Nada se perde.
      throw new Error(`PARE: usuários reais eram ${reaisAntes} e ficaram ${reaisDepois}`)
    }

    confirmando = true
    await c.query("COMMIT")
    registrar(`troca concluída em ${((Date.now() - t0) / 1000).toFixed(1)}s — ${apagados} visitantes apagados`)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (confirmando) {
      // A conexão caiu com o COMMIT em trânsito: a troca pode ter sido confirmada
      // OU desfeita — só o banco sabe. Dizer "foi desfeito" aqui seria mentira.
      registrar(`a conexão caiu DURANTE a confirmação: resultado INDETERMINADO — ${msg}`)
      registrar("→ reconecte e confira as contagens (usuários demo e transações) antes de rodar de novo. Rodar de novo é seguro.")
    } else {
      try {
        await c.query("ROLLBACK")
      } catch {
        /* conexão já caiu; o banco desfaz sozinho */
      }
      registrar(`FALHOU e foi desfeito: ${msg}`)
    }
    try {
      await c.end()
    } catch {
      /* já caiu */
    }
    process.exitCode = 1
    return
  }

  // `users` continua com o espaço morto dos 1,2 mil visitantes. É tabela pequena:
  // aqui o VACUUM FULL cabe no disco e devolve o arquivo inteiro.
  // A partir daqui a troca JÁ ESTÁ confirmada: uma falha nesta fase é cosmética
  // (faltou o VACUUM ou o relatório final), nunca perda de dados.
  registrar("recuperando o espaço de users…")
  try {
    await c.query("VACUUM FULL users")
    await c.query("VACUUM ANALYZE")

    const tamanhoDepois = (await um("SELECT pg_size_pretty(pg_database_size(current_database())) AS s")).s
    const transacoes = await n("SELECT COUNT(*)::bigint AS n FROM transactions")
    registrar(`tamanho: ${tamanhoAntes} → ${tamanhoDepois} | transações restantes: ${transacoes}`)
    registrar("→ o Supabase reavalia o espaço periodicamente; o modo somente leitura sai sozinho depois disso.")
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    registrar(`a troca está CONFIRMADA; só o VACUUM/relatório falhou depois dela: ${msg}`)
    registrar("→ se quiser o espaço de users de volta, rode `VACUUM FULL users` à mão quando o banco aceitar.")
  }

  try {
    await c.end()
  } catch {
    /* já caiu */
  }
}

main()
