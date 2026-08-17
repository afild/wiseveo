/**
 * Garante que a migração inicial única (`prisma/migrations/<timestamp>_init/migration.sql`)
 * é exatamente o que o schema atual gera. Sem isto, um banco NOVO criado pelo Setup Wizard
 * nasceria com um esquema velho.
 *
 * Contexto: os bancos reais deste projeto são evoluídos com `prisma db push` (sem histórico
 * de migrações); a pasta prisma/migrations serve SÓ para criar bancos novos, então mantemos
 * uma única migração squashed. Depois de mudar prisma/schema.prisma:
 *   npm run migrations:regen   (regenera o init)
 *   npm run check:migrations   (confere — roda também no `npm run build`)
 */
import { spawnSync } from "child_process"
import fs from "fs"
import path from "path"

const root = process.cwd()
const migrationsDir = path.join(root, "prisma", "migrations")

const dirs = fs.existsSync(migrationsDir)
  ? fs.readdirSync(migrationsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
  : []

if (dirs.length !== 1 || !dirs[0].endsWith("_init")) {
  console.error(`❌ prisma/migrations deve conter exatamente UMA migração "<timestamp>_init" (encontrado: ${dirs.join(", ") || "nada"}).`)
  console.error("   Bancos existentes evoluem com `prisma db push`; a pasta serve só para bancos novos.")
  process.exit(1)
}

const initFile = path.join(migrationsDir, dirs[0], "migration.sql")
const committed = normalize(fs.readFileSync(initFile, "utf8"))

const npx = process.platform === "win32" ? "npx.cmd" : "npx"
const result = spawnSync(
  npx,
  ["prisma", "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script"],
  { cwd: root, encoding: "utf8", shell: process.platform === "win32" },
)

if (result.status !== 0) {
  console.error("❌ Falha ao gerar o SQL do schema com o Prisma CLI:\n" + (result.stderr || result.stdout))
  process.exit(1)
}

const generated = normalize(result.stdout)

if (generated !== committed) {
  console.error(`❌ ${path.relative(root, initFile)} está desatualizada em relação a prisma/schema.prisma.`)
  console.error("   Rode: npm run migrations:regen")
  process.exit(1)
}

console.log(`✅ ${path.relative(root, initFile)} corresponde ao schema atual.`)

function normalize(sql: string): string {
  return sql
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !line.startsWith("Loaded Prisma config") && !line.startsWith("Prisma schema loaded"))
    .join("\n")
    .trim()
}
