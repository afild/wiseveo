/**
 * backup-sandbox-spike.ts: prova de viabilidade do backup pelo Vercel Sandbox.
 *
 * Roda da máquina do dono, contra o banco da DEMO (o `.env.local` desta máquina), e
 * responde: o Sandbox alcança o Supabase? por qual endereço? quanto tempo leva o ciclo?
 * NÃO grava nada em banco nenhum: pg_dump só lê.
 *
 * Uso (PowerShell, na raiz do projeto):
 *   $env:VERCEL_TOKEN="..."; $env:VERCEL_TEAM_ID="team_..."; $env:VERCEL_PROJECT_ID="prj_..."
 *   npx tsx --env-file=.env.local scripts/backup-sandbox-spike.ts
 *
 * O token de acesso é criado em vercel.com/account/tokens (escopo: o time do projeto,
 * validade curta) e apagado depois da prova. Nunca vai para arquivo nenhum.
 *
 * As três variáveis são obrigatórias: o SDK do Sandbox (@vercel/sandbox 3.2.1) só lê
 * VERCEL_OIDC_TOKEN do ambiente sozinho, e exige token + teamId + projectId juntos.
 */
import { Sandbox } from "@vercel/sandbox"
import { pgEnvFromUrl, resolveDumpUrl } from "../src/features/backup/lib/dump-url"

const stamp = (from: number) => `${((Date.now() - from) / 1000).toFixed(1)}s`

/** Ref do projeto Supabase da DEMO, quando a env não está no ambiente. */
const DEMO_REF_PADRAO = "numdueordmowmmgkfsie"

/**
 * Guarda da DEMO. Vale para toda URL que este script vai usar, não só a DATABASE_URL:
 * nenhum endereço fora do banco da DEMO pode ser tocado aqui.
 */
function assertDemoUrl(label: string, url: string) {
  const ref = process.env.DEMO_DB_REF ?? DEMO_REF_PADRAO
  if (!url.includes(ref)) {
    throw new Error(`${label} não é a da DEMO (ref esperado: ${ref}). Este script só roda contra a DEMO.`)
  }
}

type StepParams = Parameters<Sandbox["runCommand"]>[0]

/**
 * Passo de preparo do Sandbox: loga no mesmo padrão dos outros e ABORTA se sair
 * diferente de zero. Sem isso, uma instalação quebrada faria os dois pg_dump
 * falharem por falta de binário e o RESULTADO viraria um falso negativo.
 */
async function runStep(sandbox: Sandbox, label: string, since: number, params: StepParams) {
  const step = await sandbox.runCommand(params)
  console.log(`${label} exit=${step.exitCode} em ${stamp(since)}`)
  if (step.exitCode !== 0) {
    console.log(`${label} stderr: ${(await step.stderr()).slice(0, 400)}`)
    throw new Error(
      `Preparação do Sandbox falhou em "${label}" (exit=${step.exitCode}). O teste de rede nem chegou a rodar, então o resultado não vale nada.`,
    )
  }
  return step
}

async function tryDump(sandbox: Sandbox, label: string, url: string): Promise<boolean> {
  const started = Date.now()
  const env = pgEnvFromUrl(url)
  console.log(`\n[${label}] host ${env.PGHOST}:${env.PGPORT}`)
  const dump = await sandbox.runCommand({
    cmd: "pg_dump",
    args: ["--schema=public", "--format=custom", "--no-owner", "--no-privileges", "--file", `/tmp/${label}.dump`],
    env: { ...env, PGCONNECT_TIMEOUT: "30", PGSSLMODE: "require" },
  })
  console.log(`[${label}] pg_dump exit=${dump.exitCode} em ${stamp(started)}`)
  if (dump.exitCode !== 0) {
    console.log(`[${label}] stderr: ${(await dump.stderr()).slice(0, 400)}`)
    return false
  }
  const toc = await sandbox.runCommand({ cmd: "pg_restore", args: ["--list", `/tmp/${label}.dump`] })
  const lines = (await toc.stdout()).split("\n")
  const file = await sandbox.readFileToBuffer({ path: `/tmp/${label}.dump` })
  console.log(`[${label}] índice: ${lines.length} linhas; arquivo: ${file?.length ?? 0} bytes; TABLE DATA transactions: ${lines.some((l) => l.includes("TABLE DATA public transactions"))}`)
  return true
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error("DATABASE_URL ausente: rode com --env-file=.env.local (banco da DEMO)")
  assertDemoUrl("A DATABASE_URL", databaseUrl)
  // A DIRECT_URL também passa pela guarda antes de qualquer pg_dump. Se ela existe e
  // não é da DEMO, o ambiente não é o esperado e o script inteiro para aqui.
  const direct = process.env.DIRECT_URL
  if (direct) assertDemoUrl("A DIRECT_URL", direct)
  const token = process.env.VERCEL_TOKEN
  const teamId = process.env.VERCEL_TEAM_ID
  const projectId = process.env.VERCEL_PROJECT_ID
  if (!token || !teamId || !projectId) {
    throw new Error("Faltam VERCEL_TOKEN, VERCEL_TEAM_ID e VERCEL_PROJECT_ID: o SDK do Sandbox não lê essas variáveis sozinho")
  }
  const started = Date.now()
  const sandbox = await Sandbox.create({
    resources: { vcpus: 1 },
    timeout: 8 * 60 * 1000,
    token,
    teamId,
    projectId,
  })
  console.log(`sandbox criado em ${stamp(started)}`)
  try {
    const install = Date.now()
    // A imagem do Sandbox chega com as listas do apt vazias: sem este update o
    // install seguinte morre com "Unable to locate package".
    await runStep(sandbox, "apt-get update", install, { cmd: "apt-get", args: ["update"], sudo: true })
    await runStep(sandbox, "postgresql-common", install, { cmd: "apt-get", args: ["install", "-y", "postgresql-common"], sudo: true })
    await runStep(sandbox, "repositório PGDG", install, { cmd: "/usr/share/postgresql-common/pgdg/apt.postgresql.org.sh", args: ["-y"], sudo: true })
    await runStep(sandbox, "postgresql-client-18", install, { cmd: "apt-get", args: ["install", "-y", "postgresql-client-18"], sudo: true })
    const version = await runStep(sandbox, "pg_dump --version", install, { cmd: "pg_dump", args: ["--version"] })
    console.log(`pg_dump: ${(await version.stdout()).trim()}`)

    // Sonda, não preparo: pode sair com qualquer código e o script segue.
    const ipv6 = await sandbox.runCommand({ cmd: "bash", args: ["-c", "curl -6 -s --max-time 8 https://api64.ipify.org || echo SEM-IPV6"] })
    console.log(`saída IPv6 do sandbox: ${(await ipv6.stdout()).trim()}`)

    // O Next aumenta NodeJS.ProcessEnv com NODE_ENV obrigatório, então o objeto
    // mínimo do plano precisa carregar NODE_ENV junto. DIRECT_URL fica de fora de
    // propósito: esta chamada é a do pooler.
    const pooler = resolveDumpUrl({ NODE_ENV: process.env.NODE_ENV, DATABASE_URL: databaseUrl })
    const results = {
      direct: direct ? await tryDump(sandbox, "direto", direct) : null,
      pooler: await tryDump(sandbox, "pooler", pooler),
    }
    console.log(`\nRESULTADO: direto=${results.direct} pooler=${results.pooler} ciclo=${stamp(started)}`)
  } finally {
    const stopped = await sandbox.stop()
    console.log(`sandbox parado; CPU ativa ${stopped.activeCpuDurationMs} ms`)
  }
}

main().catch((error) => {
  console.error("FALHOU:", error instanceof Error ? error.message : error)
  process.exit(1)
})
