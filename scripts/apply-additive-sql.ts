/**
 * Aplica um arquivo SQL ADITIVO (prisma/additive/*.sql) num banco existente, pela
 * conexão DIRETA, dentro da transação que o próprio arquivo abre/fecha.
 *
 * Uso: npx tsx --env-file=.env.local scripts/apply-additive-sql.ts prisma/additive/<arquivo>.sql [--url-env DIRECT_URL]
 *
 * Guardas (regra de ouro do banco pessoal): recusa arquivos que contenham DROP,
 * TRUNCATE ou ALTER ... DROP; imprime o resumo do que vai rodar; nunca imprime a URL.
 */
import fs from "fs"
import path from "path"
import { Client } from "pg"

const file = process.argv[2]
const urlEnvFlag = process.argv.indexOf("--url-env")
const urlEnv = urlEnvFlag !== -1 ? process.argv[urlEnvFlag + 1] : "DIRECT_URL"

if (!file) {
  console.error("Uso: tsx scripts/apply-additive-sql.ts <arquivo.sql> [--url-env DIRECT_URL]")
  process.exit(1)
}

const sql = fs.readFileSync(path.resolve(file), "utf8")
const sqlWithoutComments = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n")
if (/\b(DROP|TRUNCATE)\b/i.test(sqlWithoutComments)) {
  console.error("❌ Recusado: o arquivo contém DROP/TRUNCATE. Só SQL aditivo é aplicado por este script.")
  process.exit(1)
}

const url = process.env[urlEnv]
if (!url) {
  console.error(`❌ Variável ${urlEnv} não definida (use --env-file=.env.local).`)
  process.exit(1)
}

const statements = sqlWithoutComments.match(/^(ALTER TABLE|CREATE TABLE|CREATE UNIQUE INDEX|CREATE INDEX|DO \$\$)/gm)
console.log(`Arquivo: ${file}`)
console.log(`Comandos: ${statements?.length ?? 0} (${[...new Set(statements ?? [])].join(", ")})`)

;(async () => {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 20000 })
  await client.connect()
  try {
    await client.query(sql)
    console.log("✅ Aplicado com sucesso (transação confirmada).")
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {})
    console.error("❌ Falhou; transação desfeita:", e instanceof Error ? e.message : e)
    process.exitCode = 1
  } finally {
    await client.end()
  }
})()
