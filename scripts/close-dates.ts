/**
 * close-dates.ts — FECHAMENTO INICIAL do histórico, feito uma vez, no banco de verdade.
 *
 * O dono lança todo dia desde 03/10/2024. Quando a feature de fechamento entra no ar, todo esse
 * histórico é fechado de uma vez por este script, com o dono presente; do dia seguinte em diante
 * ele fecha pelo app, dia a dia.
 *
 * REGRA QUE MANDA EM TUDO AQUI: este script nunca toca no banco pessoal do dono sem que ele peça,
 * naquele momento, e forneça a URL naquele momento. Daí as travas:
 *
 * 1. NÃO lê `.env.local` (o npm script não passa `--env-file`, de propósito: o `.env.local` deste
 *    computador aponta para a DEMO). As duas variáveis vêm explícitas na linha de comando.
 * 2. `DATABASE_URL` do ambiente é APAGADA antes de qualquer serviço ser carregado. Se um dia
 *    alguém chamar aqui uma função que usa o cliente global do app, ela estoura em vez de escrever
 *    num banco que ninguém escolheu. A única conexão é a que este arquivo abre, com a URL pedida.
 * 3. O padrão é SIMULAÇÃO. Escrever exige `--apply`, sempre, inclusive para reverter.
 * 4. Antes de gravar, o script salva num arquivo a linha inteira que vai mudar. Se o arquivo não
 *    puder ser salvo e relido, NADA é gravado.
 *
 * Uso:
 *   CLOSE_DATES_DATABASE_URL=... CLOSE_DATES_OWNER_EMAIL=... npm run close-dates -- --through 2026-08-31
 *   ... mesmo comando com --apply para gravar
 *   ... --revert backups/close-dates-<id>-<data>.json --apply para desfazer
 *
 * Códigos de saída: 0 sucesso ou simulação; 1 recusa (bloqueadores, reabertura, nada a fazer);
 * 2 uso ou ambiente inválido (variável faltando, data ilegível, dono não encontrado).
 */
import fs from "node:fs"
import path from "node:path"
import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../src/generated/prisma_new/client"
import { isDayKey, dayKeyOfStored } from "../src/features/security/lib/date-closing"
import { readOwnerClosing } from "../src/features/security/services/read-owner-closing"
import { mergeUserPreferenceKey } from "../src/features/settings/services/user-preferences-write"
import { endOfUTCDay } from "../src/lib/financial"
import { planCloseDates } from "./lib/close-dates-plan"

/**
 * Trava 2 (ver o cabeçalho): nenhuma conexão "de ambiente" sobrevive a esta linha. Roda ANTES do
 * `import()` dinâmico do serviço lá embaixo, que é quem arrasta `@/lib/prisma`.
 */
delete process.env.DATABASE_URL

const USAGE = `
Uso:
  CLOSE_DATES_DATABASE_URL=<url> CLOSE_DATES_OWNER_EMAIL=<email> npm run close-dates -- --through YYYY-MM-DD [--apply]
  CLOSE_DATES_DATABASE_URL=<url> CLOSE_DATES_OWNER_EMAIL=<email> npm run close-dates -- --revert <arquivo.json> [--apply]

  --through YYYY-MM-DD   dia até o qual fechar (inclusive).
  --apply                grava de verdade. Sem ele, o script só simula.
  --revert <arquivo>     devolve preferences_json inteiro ao que está no snapshot.
`

/** Sai com mensagem de uso. Código 2 = ninguém tocou no banco. */
function usageError(message: string): never {
  console.error(`\nERRO: ${message}`)
  console.error(USAGE)
  process.exit(2)
}

interface Args {
  through: string | null
  apply: boolean
  revert: string | null
}

function parseArgs(argv: string[]): Args {
  const args: Args = { through: null, apply: false, revert: null }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const eq = arg.startsWith("--") ? arg.indexOf("=") : -1
    const flag = eq >= 0 ? arg.slice(0, eq) : arg
    const inline = eq >= 0 ? arg.slice(eq + 1) : null
    const value = () => {
      const v = inline ?? argv[++i]
      if (!v || v.startsWith("--")) usageError(`${flag} exige um valor.`)
      return v
    }
    if (flag === "--through") args.through = value()
    else if (flag === "--revert") args.revert = value()
    else if (flag === "--apply") args.apply = true
    else usageError(`argumento desconhecido: ${arg}`)
  }
  return args
}

/** Host e nome do banco, NUNCA usuário nem senha. É o que o dono confere antes de autorizar. */
function describeTarget(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    usageError("CLOSE_DATES_DATABASE_URL não é uma URL válida.")
  }
  const host = parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname
  const database = parsed.pathname.replace(/^\//, "") || "(sem nome)"
  return `${host}/${database}`
}

const money = (value: number) => (value < 0 ? "-" : "") + Math.abs(value).toFixed(2)

/** `json` ou `jsonb`: o banco pessoal nunca rodou a migração init e pode ter a coluna como `json`. */
async function preferencesColumnType(client: PrismaClient): Promise<"json" | "jsonb"> {
  const rows = await client.$queryRawUnsafe<Array<{ data_type: string }>>(
    `SELECT data_type FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'preferences_json'`,
  )
  return rows[0]?.data_type?.toLowerCase() === "json" ? "json" : "jsonb"
}

interface OwnerRow {
  id: string
  email: string
  name: string | null
  preferences_json: unknown
}

/**
 * O dono pelo e-mail, e SÓ se ele for único. Duas linhas com o mesmo e-mail em caixas diferentes
 * seriam a receita para gravar na linha errada: aqui isso vira recusa, não escolha silenciosa.
 */
async function findOwner(client: PrismaClient, email: string): Promise<OwnerRow> {
  const rows = await client.$queryRawUnsafe<OwnerRow[]>(
    `SELECT id, email, name, preferences_json FROM users WHERE lower(email) = lower($1) LIMIT 2`,
    email,
  )
  if (rows.length === 0) usageError(`nenhum usuário com o e-mail ${email} neste banco.`)
  if (rows.length > 1) usageError(`mais de um usuário com o e-mail ${email}. Recusando por segurança.`)
  return rows[0]
}

interface Snapshot {
  id: string
  preferences_json: unknown
}

/**
 * Salva a linha inteira em arquivo e RELÊ para conferir. Devolve o caminho. Qualquer falha lança,
 * e quem chama não grava nada: snapshot que não existe no disco não serve de volta.
 */
function saveSnapshot(row: OwnerRow, extra: Record<string, unknown>): string {
  const dir = path.join(process.cwd(), "backups")
  fs.mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const safeId = row.id.replace(/[^A-Za-z0-9_-]/g, "_")
  const file = path.join(dir, `close-dates-${safeId}-${stamp}.json`)
  const payload = { id: row.id, preferences_json: row.preferences_json ?? null, ...extra }
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf-8")
  const reread = JSON.parse(fs.readFileSync(file, "utf-8")) as Snapshot
  if (reread.id !== row.id) throw new Error(`snapshot ${file} não releu o mesmo id`)
  if (JSON.stringify(reread.preferences_json) !== JSON.stringify(row.preferences_json ?? null)) {
    throw new Error(`snapshot ${file} não releu o mesmo preferences_json`)
  }
  return file
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

/** Diferença por chave de topo, para o dono ver o que a reversão faz ANTES de autorizar. */
function printPreferencesDiff(current: unknown, target: unknown): void {
  const cur = asRecord(current)
  const tgt = asRecord(target)
  const keys = Array.from(new Set([...Object.keys(cur), ...Object.keys(tgt)])).sort()
  if (keys.length === 0) {
    console.log("  (nenhuma chave dos dois lados)")
    return
  }
  for (const key of keys) {
    const inCur = key in cur
    const inTgt = key in tgt
    const same = JSON.stringify(cur[key]) === JSON.stringify(tgt[key])
    if (inCur && inTgt && same) console.log(`  = ${key} (igual)`)
    else if (inCur && inTgt) console.log(`  ~ ${key} VOLTA ao valor do snapshot`)
    else if (inCur && !inTgt) console.log(`  - ${key} SOME (não existe no snapshot)`)
    else console.log(`  + ${key} VOLTA (existe só no snapshot)`)
  }
}

async function runClose(
  client: PrismaClient,
  owner: OwnerRow,
  closedThrough: string | null,
  args: Args,
): Promise<number> {
  const through = args.through as string

  const bounds = await client.transaction.aggregate({
    where: { userId: owner.id },
    _min: { date: true },
    _max: { date: true },
  })
  const total = await client.transaction.count({
    where: {
      userId: owner.id,
      date: { ...(closedThrough ? { gt: endOfUTCDay(closedThrough) } : {}), lte: endOfUTCDay(through) },
    },
  })

  console.log(`  1º lançamento: ${bounds._min.date ? dayKeyOfStored(bounds._min.date) : "(nenhum)"}`)
  console.log(`  último.......: ${bounds._max.date ? dayKeyOfStored(bounds._max.date) : "(nenhum)"}`)
  console.log(`\nLançamentos que este fechamento passa a proteger: ${total}`)

  // Cliente próprio no lugar da transação: só SELECT, e o serviço é o mesmo que o app usa.
  const { findUnpaidBlockers } = await import("../src/features/security/services/date-closing.service")
  const blockers = await findUnpaidBlockers(client, owner.id, closedThrough, through)
  console.log(`Bloqueadores (não pagos na faixa): ${blockers.count}`)
  if (blockers.count > 0) {
    console.log(`  faixa........: ${blockers.firstDate} a ${blockers.lastDate}`)
    console.log(`  amostra (até ${blockers.sample.length}):`)
    for (const row of blockers.sample) {
      console.log(`    ${row.date}  ${money(row.amount).padStart(12)}  [${row.status}]  ${row.description ?? "(sem descrição)"}`)
    }
    if (blockers.count > blockers.sample.length) {
      console.log(`    ... e mais ${blockers.count - blockers.sample.length} sem listar.`)
    }
  }

  const plan = planCloseDates({ closedThrough, through, blockersCount: blockers.count, apply: args.apply })

  if (plan.action === "refuse") {
    console.log("")
    if (plan.reason === "blockers") {
      console.log(`RECUSADO: há ${blockers.count} lançamento(s) não pago(s) até ${through}. Resolva pelo app e rode de novo.`)
    } else if (plan.reason === "wouldReopen") {
      console.log(`RECUSADO: o corte atual é ${closedThrough} e ${through} é anterior. Reabrir data é pelo app, com PIN.`)
    } else {
      console.log(`NADA A FAZER: o corte já é ${closedThrough}.`)
    }
    console.log("Nada foi gravado.")
    return 1
  }

  if (plan.action === "simulate") {
    console.log("")
    console.log(`SIMULAÇÃO. Nada foi gravado. O corte iria de ${closedThrough ?? "(nenhum)"} para ${through}.`)
    console.log("Para gravar de verdade, repita o comando com --apply.")
    return 0
  }

  console.log("")
  console.log(`APLICANDO: corte de ${closedThrough ?? "(nenhum)"} para ${through}.`)
  const snapshot = saveSnapshot(owner, {
    kind: "before-close",
    savedAt: new Date().toISOString(),
    ownerEmail: owner.email,
    closedThroughBefore: closedThrough,
    requestedThrough: through,
  })
  console.log(`Snapshot salvo em: ${snapshot}`)

  await mergeUserPreferenceKey(client, owner.id, "dateClosing", { closedThrough: through })

  const after = await readOwnerClosing(client, owner.id, null)
  console.log("\nEstado novo:")
  console.log(`  corte........: ${after.closedThrough ?? "(nenhum)"}`)
  console.log(`  PIN definido.: ${after.pinHash !== null ? "sim" : "não"}`)
  if (after.closedThrough !== through) {
    console.log(`\nATENÇÃO: o corte lido de volta (${after.closedThrough ?? "nenhum"}) não é o pedido (${through}). Confira a linha.`)
    console.log(`Para desfazer: npm run close-dates -- --revert ${snapshot} --apply`)
    return 1
  }
  console.log(`\nPronto. Para desfazer: npm run close-dates -- --revert ${snapshot} --apply`)
  return 0
}

async function runRevert(client: PrismaClient, owner: OwnerRow, args: Args): Promise<number> {
  const file = path.resolve(process.cwd(), args.revert as string)
  if (!fs.existsSync(file)) usageError(`snapshot não encontrado: ${file}`)

  let snapshot: Snapshot
  try {
    snapshot = JSON.parse(fs.readFileSync(file, "utf-8")) as Snapshot
  } catch (error) {
    usageError(`snapshot ilegível (${file}): ${error instanceof Error ? error.message : String(error)}`)
  }
  if (typeof snapshot.id !== "string" || !("preferences_json" in snapshot)) {
    usageError(`snapshot ${file} não tem os campos id e preferences_json.`)
  }
  if (snapshot.id !== owner.id) {
    usageError(`o snapshot é do usuário ${snapshot.id}, e o e-mail informado resolveu para ${owner.id}.`)
  }

  console.log("\nA reversão troca preferences_json INTEIRO pelo conteúdo do snapshot.")
  console.log("Chaves afetadas:")
  printPreferencesDiff(owner.preferences_json, snapshot.preferences_json)

  if (!args.apply) {
    console.log("")
    console.log("SIMULAÇÃO. Nada foi gravado.")
    console.log(`Para reverter de verdade: npm run close-dates -- --revert ${args.revert} --apply`)
    return 0
  }

  // Reverter também é uma escrita: guarda o estado ATUAL antes, senão a própria reversão vira o
  // buraco sem volta (um PIN definido depois do snapshot sumiria sem cópia).
  const before = saveSnapshot(owner, {
    kind: "before-revert",
    savedAt: new Date().toISOString(),
    ownerEmail: owner.email,
    revertedFrom: file,
  })
  console.log(`\nEstado atual guardado em: ${before}`)

  const type = await preferencesColumnType(client)
  const value =
    snapshot.preferences_json === null || snapshot.preferences_json === undefined
      ? null
      : JSON.stringify(snapshot.preferences_json)
  const affected =
    type === "json"
      ? await client.$executeRawUnsafe("UPDATE users SET preferences_json = $1::json WHERE id = $2", value, owner.id)
      : await client.$executeRawUnsafe("UPDATE users SET preferences_json = $1::jsonb WHERE id = $2", value, owner.id)
  if (affected !== 1) {
    console.log(`\nATENÇÃO: o UPDATE afetou ${affected} linha(s), esperava 1.`)
    return 1
  }

  const after = await readOwnerClosing(client, owner.id, null)
  console.log("\nRevertido. Estado novo:")
  console.log(`  corte........: ${after.closedThrough ?? "(nenhum)"}`)
  console.log(`  PIN definido.: ${after.pinHash !== null ? "sim" : "não"}`)
  return 0
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2))

  const url = process.env.CLOSE_DATES_DATABASE_URL?.trim()
  const email = process.env.CLOSE_DATES_OWNER_EMAIL?.trim().toLowerCase()
  if (!url) usageError("CLOSE_DATES_DATABASE_URL é obrigatória. Este script nunca lê .env.local.")
  if (!email) usageError("CLOSE_DATES_OWNER_EMAIL é obrigatória.")
  if (args.revert === null && args.through === null) usageError("informe --through YYYY-MM-DD (ou --revert <arquivo>).")
  if (args.revert !== null && args.through !== null) usageError("--revert e --through não andam juntos.")
  if (args.through !== null && !isDayKey(args.through)) usageError(`--through ${args.through} não é uma data YYYY-MM-DD válida.`)

  const today = dayKeyOfStored(new Date())
  if (args.through !== null && args.through > today) {
    usageError(`--through ${args.through} está no futuro (hoje em UTC é ${today}). Fechar o futuro não é o objetivo deste script.`)
  }

  const target = describeTarget(url)
  console.log("\n================ FECHAMENTO DE DATAS ================")
  console.log(`Banco.......: ${target}`)
  console.log(`Dono........: ${email}`)
  console.log(
    `Modo........: ${args.revert !== null ? "REVERTER" : "FECHAR"} / ${args.apply ? "APLICAR (grava)" : "SIMULAÇÃO (não grava)"}`,
  )
  if (args.through !== null) console.log(`Fechar até..: ${args.through}`)
  if (args.revert !== null) console.log(`Snapshot....: ${args.revert}`)
  console.log("=====================================================\n")

  const pool = new Pool({ connectionString: url })
  const client = new PrismaClient({ adapter: new PrismaPg(pool) })

  try {
    const owner = await findOwner(client, email)
    const closing = await readOwnerClosing(client, owner.id, null)

    console.log("Dono encontrado:")
    console.log(`  id...........: ${owner.id}`)
    console.log(`  e-mail.......: ${owner.email}`)
    console.log(`  nome.........: ${owner.name ?? "(sem nome)"}`)
    console.log(`  corte atual..: ${closing.closedThrough ?? "(nenhum: tudo aberto)"}`)
    console.log(`  PIN definido.: ${closing.pinHash !== null ? "sim" : "não"}`)

    if (args.revert !== null) return await runRevert(client, owner, args)
    return await runClose(client, owner, closing.closedThrough, args)
  } finally {
    await client.$disconnect()
    await pool.end()
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error("\nFALHOU:", error instanceof Error ? error.message : error)
    process.exit(1)
  })
