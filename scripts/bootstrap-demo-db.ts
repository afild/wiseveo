import { Client } from "pg"
import {
  applyPrismaMigrations,
  loadMigrationFiles,
} from "../src/features/setup/services/prisma-migrations.service"

/**
 * LEVANTA UM BANCO DE DEMO NOVO, DO ZERO — o "Caminho 2" de 29/08/2026.
 *
 * Uso:
 *   1. Crie o projeto Supabase novo e copie a URL de conexão (pooler, porta 6543).
 *   2. Ponha-a numa variável PRÓPRIA — nunca em DATABASE_URL, para não haver
 *      chance de o comando pegar a conexão errada:
 *        NEW_DEMO_DATABASE_URL="postgresql://..."
 *   3. npx tsx --env-file=.env.local scripts/bootstrap-demo-db.ts
 *
 * POR QUE EXISTE: quando o banco da demo encheu o disco em 25/08 e o Postgres
 * parou de subir (ficou preso refazendo o próprio diário, `57P03 ... Hot standby
 * mode is disabled`), não havia como apagar nada — sem conexão não se apaga, e
 * sem apagar não há conexão. A saída passou a ser trocar o banco por um vazio.
 *
 * Aplica as MESMAS migrações que o assistente de instalação aplica, pelo mesmo
 * serviço (`applyPrismaMigrations`), então o banco novo nasce idêntico ao que o
 * Setup Wizard criaria — incluindo os índices por dono que faltavam e que foram
 * a causa de fundo do problema.
 *
 * TRÊS TRAVAS, porque este script cria esquema e a conexão errada seria grave:
 * 1. Só lê de uma variável dedicada (nunca de DATABASE_URL/DIRECT_URL).
 * 2. Recusa qualquer URL que aponte para o projeto do banco PESSOAL do dono.
 * 3. Recusa banco que já tenha o esquema do WISEVEO — este script é para banco
 *    VAZIO; um banco em uso se evolui por outro caminho.
 */

/** Projeto Supabase do banco PESSOAL. Nunca, em nenhuma hipótese, por aqui. */
const REF_PROIBIDO = "sgwtlqdbvazsngjnwahz"

const VAR = "NEW_DEMO_DATABASE_URL"

async function main() {
  const alvo = process.env[VAR]
  if (!alvo) {
    console.error(`❌ Defina ${VAR} com a URL do banco NOVO (e vazio) antes de rodar.`)
    console.error("   Use uma variável própria de propósito: assim não há como pegar o banco errado.")
    process.exitCode = 1
    return
  }

  if (alvo.includes(REF_PROIBIDO)) {
    console.error("❌ Esta URL aponta para o banco PESSOAL do dono. Abortando.")
    process.exitCode = 1
    return
  }

  const url = new URL(alvo)
  console.log(`alvo: ${url.hostname}:${url.port}`)

  const c = new Client({ connectionString: alvo, connectionTimeoutMillis: 30000 })
  c.on("error", () => {})
  await c.connect()

  try {
    const jaTem = await c.query(
      `SELECT to_regclass('public.transactions') IS NOT NULL AS existe`,
    )
    if (jaTem.rows[0].existe) {
      console.error("❌ Este banco JÁ tem o esquema do WISEVEO. Este script é só para banco vazio.")
      process.exitCode = 1
      return
    }

    const files = loadMigrationFiles()
    if (files.length === 0) {
      console.error("❌ Nenhuma migração encontrada em prisma/migrations.")
      process.exitCode = 1
      return
    }
    console.log(`aplicando ${files.length} migração(ões): ${files.map((f) => f.name).join(", ")}`)

    const r = await applyPrismaMigrations(c, files)
    if (!r.ok) {
      console.error(`❌ falhou em ${r.migration}: ${r.detail}`)
      process.exitCode = 1
      return
    }
    console.log(`✅ aplicadas: ${r.applied.join(", ") || "(nenhuma nova)"}`)

    // Confere o que interessa: as tabelas existem e os índices por dono também.
    const tabelas = await c.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM information_schema.tables WHERE table_schema = 'public'`,
    )
    const indices = await c.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname IN ('categories_user_id_idx','categories_group_id_idx',
                            'transaction_statuses_user_id_idx','excluded_transactions_user_id_idx',
                            'recurring_transactions_user_id_idx')
        ORDER BY indexname`,
    )
    console.log(`tabelas: ${tabelas.rows[0].n} | índices por dono: ${indices.rows.length}/5`)
    for (const i of indices.rows) console.log(`  ${i.indexname}`)
    if (indices.rows.length !== 5) {
      console.error("❌ os índices por dono não vieram todos — o banco não nasceu certo.")
      process.exitCode = 1
      return
    }

    console.log("")
    console.log("PRÓXIMOS PASSOS (fora daqui):")
    console.log("  1. Trocar DATABASE_URL e DIRECT_URL no projeto wiseveo-demo da Vercel e redeploy.")
    console.log("  2. Trocar as mesmas duas em .env.local (e DEMO_DB_REF para o ref novo).")
    console.log("  3. Cadastrar a faxina no despertador externo, a cada 15 min:")
    console.log("     https://demo.wiseveo.com/api/cron/cleanup-demo?key=<CRON_SECRET>")
    console.log("  4. Abrir https://demo.wiseveo.com e conferir que provisiona.")
  } finally {
    await c.end().catch(() => {})
  }
}

main()
