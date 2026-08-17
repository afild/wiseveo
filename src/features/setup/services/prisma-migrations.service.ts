import crypto from "crypto"
import fs from "fs"
import path from "path"

/**
 * Aplica as migrações de `prisma/migrations` direto pelo `pg`, sem depender do
 * CLI do Prisma (`npx prisma migrate deploy` não existe em produção: o CLI é
 * devDependency, não vai no bundle da Vercel e o disco lá é só-leitura).
 *
 * Compatível com o Prisma: mesma tabela `_prisma_migrations`, mesmo checksum
 * (sha256 hex do migration.sql), então `prisma migrate deploy/dev` continuam
 * funcionando no mesmo banco depois.
 */

export interface MigrationFile {
  name: string
  sql: string
  checksum: string
}

export interface MigrationQueryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>
}

export type MigrationsResult =
  | { ok: true; applied: string[]; alreadyApplied: number; skippedExistingSchema: boolean }
  | { ok: false; code: "migrationFailed"; migration: string; detail: string }

// DDL idêntico ao que o schema engine do Prisma cria.
// i18n-ignore: SQL bruto, não é texto de UI
export const PRISMA_MIGRATIONS_TABLE_DDL = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
)`

/** Tabela do app que denuncia "banco já usado pelo WISEVEO" (mesma checagem do test-db). */
const APP_TABLE_MARKER = "transactions"

export function checksumMigration(sql: string): string {
  return crypto.createHash("sha256").update(sql).digest("hex")
}

export function defaultMigrationsDir(cwd = process.cwd()): string {
  return path.join(cwd, "prisma", "migrations")
}

/** Lê `prisma/migrations/<nome>/migration.sql` em ordem lexicográfica (= cronológica). */
export function loadMigrationFiles(dir = defaultMigrationsDir()): MigrationFile[] {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .flatMap((name) => {
      const file = path.join(dir, name, "migration.sql")
      if (!fs.existsSync(file)) return []
      const sql = fs.readFileSync(file, "utf8")
      return [{ name, sql, checksum: checksumMigration(sql) }]
    })
}

async function tableExists(client: MigrationQueryable, table: string): Promise<boolean> {
  const { rows } = await client.query(
    // i18n-ignore: SQL bruto
    `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1) AS exists`,
    [table],
  )
  return rows[0]?.exists === true
}

export async function applyPrismaMigrations(
  client: MigrationQueryable,
  files: MigrationFile[],
): Promise<MigrationsResult> {
  if (await tableExists(client, APP_TABLE_MARKER)) {
    // Banco que já tem o esquema do WISEVEO (os bancos reais deste projeto são
    // criados/evoluídos com `prisma db push`, sem histórico de migrações).
    // As migrações servem para banco NOVO; aqui não há o que aplicar e tentar o
    // init falharia com "already exists".
    return { ok: true, applied: [], alreadyApplied: 0, skippedExistingSchema: true }
  }

  await client.query(PRISMA_MIGRATIONS_TABLE_DDL)

  const { rows } = await client.query(
    // i18n-ignore: SQL bruto
    `SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at`,
  )
  const done = new Set<string>()
  for (const row of rows) {
    const name = String(row.migration_name)
    if (row.rolled_back_at) continue
    if (!row.finished_at) {
      // Registro de uma tentativa anterior que não terminou (o Prisma bloqueia neste caso).
      return { ok: false, code: "migrationFailed", migration: name, detail: "previous attempt did not finish" }
    }
    done.add(name)
  }

  const applied: string[] = []
  for (const file of files) {
    if (done.has(file.name)) continue
    const id = crypto.randomUUID()
    try {
      await client.query("BEGIN")
      await client.query(
        // i18n-ignore: SQL bruto
        `INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "started_at", "applied_steps_count") VALUES ($1, $2, $3, now(), 0)`,
        [id, file.checksum, file.name],
      )
      await client.query(file.sql)
      await client.query(
        // i18n-ignore: SQL bruto
        `UPDATE "_prisma_migrations" SET "finished_at" = now(), "applied_steps_count" = 1 WHERE "id" = $1`,
        [id],
      )
      await client.query("COMMIT")
      applied.push(file.name)
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {})
      return {
        ok: false,
        code: "migrationFailed",
        migration: file.name,
        detail: error instanceof Error ? error.message : String(error),
      }
    }
  }

  return { ok: true, applied, alreadyApplied: done.size, skippedExistingSchema: false }
}
