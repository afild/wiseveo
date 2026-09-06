import { Sandbox } from "@vercel/sandbox"
import { BackupError } from "@/features/backup/lib/backup-error"
import { pgEnvFromUrl } from "@/features/backup/lib/dump-url"

/**
 * O `pg_dump` de verdade, numa máquina Linux temporária da Vercel. É o que faz o backup
 * ser um espelho e não uma exportação (desenho §3).
 *
 * Ordem: cria o Sandbox → instala o cliente 18 pelo repositório oficial do PostgreSQL
 * (a versão do cliente tem de ser igual ou mais nova que a do servidor) → roda o pg_dump
 * com a URL quebrada em PG* por env (nunca na linha de comando) → lê o índice e o arquivo
 * → para o Sandbox, sempre, inclusive em falha.
 *
 * O `apt-get update` abre a fila porque a imagem do container chega com as listas do apt
 * vazias; sem ele o `install postgresql-common` morre com "Unable to locate package".
 * Esta é a sequência medida contra o banco da DEMO na Task 1 (preparo em 14,5 s).
 *
 * Cota Hobby: 30 execuções/mês de ~2 min com 1 vCPU ficam abaixo de 2% do que é grátis.
 */
export interface SandboxDumpResult {
  dump: Buffer
  toc: string
  pgDumpVersion: string
  durationMs: number
}

export interface SandboxDumpInput {
  databaseUrl: string
  /** Padrão 240 s: cabe nos 300 s da função com folga para o upload. */
  timeoutMs?: number
}

const DUMP_PATH = "/tmp/wiseveo.dump"

export async function runPgDumpInSandbox(input: SandboxDumpInput): Promise<SandboxDumpResult> {
  const started = Date.now()
  const sandbox = await Sandbox.create({
    resources: { vcpus: 1 },
    timeout: input.timeoutMs ?? 240_000,
  })
  try {
    for (const step of [
      { cmd: "apt-get", args: ["update"] },
      { cmd: "apt-get", args: ["install", "-y", "postgresql-common"] },
      { cmd: "/usr/share/postgresql-common/pgdg/apt.postgresql.org.sh", args: ["-y"] },
      { cmd: "apt-get", args: ["install", "-y", "postgresql-client-18"] },
    ]) {
      const result = await sandbox.runCommand({ ...step, sudo: true })
      if (result.exitCode !== 0) {
        throw new BackupError("sandboxFailed", `${step.cmd} exit ${result.exitCode}: ${(await result.stderr()).slice(0, 200)}`)
      }
    }

    const version = await sandbox.runCommand({ cmd: "pg_dump", args: ["--version"] })
    const pgDumpVersion = (await version.stdout()).trim()

    const env = { ...pgEnvFromUrl(input.databaseUrl), PGSSLMODE: "require", PGCONNECT_TIMEOUT: "30" }
    const dump = await sandbox.runCommand({
      cmd: "pg_dump",
      args: ["--schema=public", "--format=custom", "--no-owner", "--no-privileges", "--file", DUMP_PATH],
      env,
    })
    if (dump.exitCode !== 0) {
      // A senha vive só em `env`; o stderr do pg_dump não a repete.
      throw new BackupError("dumpFailed", `exit ${dump.exitCode}: ${(await dump.stderr()).slice(0, 300)}`)
    }

    const toc = await sandbox.runCommand({ cmd: "pg_restore", args: ["--list", DUMP_PATH] })
    if (toc.exitCode !== 0) throw new BackupError("dumpFailed", "pg_restore --list failed")
    const file = await sandbox.readFileToBuffer({ path: DUMP_PATH })
    if (!file) throw new BackupError("dumpFailed", "dump file missing")

    return { dump: file, toc: await toc.stdout(), pgDumpVersion, durationMs: Date.now() - started }
  } finally {
    await sandbox.stop().catch(() => undefined)
  }
}
