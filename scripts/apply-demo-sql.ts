// scripts/apply-demo-sql.ts
/**
 * Aplica os SQL EXCLUSIVOS do banco da DEMO (prisma/demo/*.sql) — e SÓ nele:
 * a guarda DEMO_DB_REF (resolveDemoDatabaseUrl) aborta qualquer outra conexão.
 * O banco PESSOAL nunca passa por aqui (D8).
 * Uso: npx tsx --env-file=.env.local scripts/apply-demo-sql.ts [arquivos...]
 * Sem argumentos, aplica todos os prisma/demo/*.sql em ordem alfabética.
 */
import fs from "node:fs"
import path from "node:path"
import { Client } from "pg"
import { resolveDemoDatabaseUrl } from "./demo-db-guard"

async function main() {
  const url = resolveDemoDatabaseUrl()
  const arquivos =
    process.argv.length > 2
      ? process.argv.slice(2)
      : fs
          .readdirSync("prisma/demo")
          .filter((f) => f.endsWith(".sql"))
          .sort()
          .map((f) => path.join("prisma/demo", f))

  const c = new Client({ connectionString: url, connectionTimeoutMillis: 30000 })
  c.on("error", () => {})
  await c.connect()
  try {
    const vitrineEmail = (process.env.DEMO_VITRINE_EMAIL ?? process.env.SEED_DEMO_EMAIL ?? "")
      .trim()
      .toLowerCase() || "demo@wiseveo.com"
    const r = await c.query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [vitrineEmail])
    for (const arquivo of arquivos) {
      let sql = fs.readFileSync(arquivo, "utf8")
      if (sql.includes("__VITRINE_ID__")) {
        if (!r.rows[0]) throw new Error(`vitrine ${vitrineEmail} não existe — rode db:seed:demo antes.`)
        sql = sql.replaceAll("__VITRINE_ID__", r.rows[0].id)
      }
      await c.query(sql)
      console.log(`aplicado: ${arquivo}`)
    }
    const n = await c.query(
      `SELECT COUNT(*)::int AS n FROM pg_trigger WHERE tgname LIKE 'vitrine_guard%' AND NOT tgisinternal`,
    )
    console.log(`gatilhos da vitrine no banco: ${n.rows[0].n}`)
  } finally {
    await c.end().catch(() => {})
  }
}
main().catch((e) => {
  console.error(e.message)
  process.exitCode = 1
})
