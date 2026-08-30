/**
 * export-demo-db.ts — gera UM arquivo .sql que recria o banco da demo INTEIRO:
 * todas as tabelas, todos os relacionamentos e todas as linhas.
 *
 * Roda 100% OFFLINE: não abre conexão com banco nenhum. Isso é possível porque
 * o conjunto de dados da demo é determinístico — `getDemoDataset()` (semente
 * 20260726) devolve sempre os mesmos 2.541 lançamentos —, e o esquema vem da
 * própria migração do Prisma que o Setup Wizard aplica.
 *
 * Uso:
 *   npx tsx scripts/export-demo-db.ts [--cutoff AAAA-MM-DD] [--out caminho.sql]
 */
import fs from "node:fs"
import path from "node:path"
import { getDemoDataset } from "../src/lib/demo-data/generate-demo-dataset"
import { materializeDataset } from "../src/lib/demo-data/materialize"
import {
  defaultAccounts,
  defaultCategories,
  defaultGroups,
  defaultStatuses,
} from "../prisma/data/default-chart-of-accounts"

const args = process.argv.slice(2)
const argOf = (flag: string) => {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}

const OUT = argOf("--out") ?? "docs/entrega/demo-db-completo.sql"
const cutoffArg = argOf("--cutoff")
// O materializador trata "realizado" como "até o fim de ontem" em relação a `now`.
const now = cutoffArg
  ? new Date(`${cutoffArg}T12:00:00.000Z`)
  : new Date()
const nowPlusOne = new Date(now.getTime() + 86400000)

// Usuário fixo, para o arquivo ser reproduzível byte a byte.
const USER_ID = "demo_de305eed-0000-4000-8000-000000000001"
const USER_EMAIL = "demo@wiseveo.com"
const PREFIX = "de305eed"
const SLOT = parseInt(PREFIX.replace(/[^0-9a-f]/gi, "").slice(0, 6), 16) % 900_000
const STAMP = "2026-07-27 12:00:00"

// ── helpers de literal SQL ────────────────────────────────────────────────────
const s = (v: string | null | undefined) =>
  v === null || v === undefined ? "NULL" : `'${v.replace(/'/g, "''")}'`
const n = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? "NULL" : String(v)
const d = (v: Date | null | undefined) =>
  v ? `'${v.toISOString().replace("T", " ").replace("Z", "")}'` : "NULL"

const out: string[] = []
const w = (line = "") => out.push(line)

// ── esquema ───────────────────────────────────────────────────────────────────
const migDir = path.join("prisma", "migrations")
const migName = fs.readdirSync(migDir).filter((f) => fs.statSync(path.join(migDir, f)).isDirectory()).sort()
const ddl = migName
  .map((m) => fs.readFileSync(path.join(migDir, m, "migration.sql"), "utf8"))
  .join("\n\n")

// ── dados ─────────────────────────────────────────────────────────────────────
const ds = getDemoDataset()

const groupCodeOffset = 1_000_000 + SLOT
const groupUuidByCode: Record<number, string> = {}
for (const g of defaultGroups) groupUuidByCode[g.code] = `grp-${PREFIX}-${g.code}`

const accountIds: Record<string, number> = {}
defaultAccounts.forEach((a, i) => (accountIds[a.type] = 1_000_000 + SLOT + i))

const rows = materializeDataset(ds, {
  userId: USER_ID,
  prefix: PREFIX,
  accountIds,
  groupUuidByCode,
  groupCodeOffset,
  payeeIdBase: 1,
  now: nowPlusOne,
})

// ids determinísticos (o materializador usa randomUUID, que mudaria a cada execução;
// o tipo estreito de UUID é irrelevante aqui — a coluna é texto livre)
rows.transactions.forEach((t, i) => ((t as { id: string }).id = `tx-${PREFIX}-${String(i + 1).padStart(6, "0")}`))
rows.recurring.forEach((r, i) => ((r as { id: string }).id = `rec-${PREFIX}-${String(i + 1).padStart(3, "0")}`))
rows.budgets.forEach((b, i) => ((b as { id: string }).id = `bgt-${PREFIX}-${String(i + 1).padStart(3, "0")}`))

const cutoffLabel = new Date(now.getTime()).toISOString().slice(0, 10)

// ── montagem do arquivo ───────────────────────────────────────────────────────
w("-- ============================================================================")
w("-- WISEVEO — banco da DEMO, completo e autocontido")
w("--")
w("-- Recria o banco inteiro num Postgres VAZIO: todas as tabelas, todos os")
w("-- relacionamentos (chaves estrangeiras, índices, enums) e todas as linhas.")
w("--")
w("-- Como usar:")
w("--   psql \"<URL_DO_BANCO_VAZIO>\" -f demo-db-completo.sql")
w("--")
w("-- Gerado OFFLINE por scripts/export-demo-db.ts. Nenhum banco foi consultado:")
w("-- o esquema vem das migrações do Prisma (as mesmas que o Setup Wizard aplica)")
w("-- e os dados vêm do gerador determinístico (semente 20260726), que produz")
w("-- sempre exatamente os mesmos lançamentos.")
w("--")
w(`-- Corte realizado/em aberto: ${cutoffLabel} (tudo até esta data nasce Pago;`)
w("-- depois dela, Pendente). Na demo ao vivo esse corte é recalculado a cada")
w("-- visitante; aqui ele está congelado, para o arquivo ser reproduzível.")
w("--")
w(`-- Migrações incluídas: ${migName.join(", ")}`)
w("-- ============================================================================")
w()
w("BEGIN;")
w()
w("-- ─── ESQUEMA ────────────────────────────────────────────────────────────────")
w(ddl)
w()
w("-- ─── DADOS ──────────────────────────────────────────────────────────────────")
w()

w("-- users")
w(
  `INSERT INTO "users" ("id","name","email","status","role","preferences_json","created_at","updated_at") VALUES\n` +
    `  (${s(USER_ID)}, ${s("Demo WISEVEO")}, ${s(USER_EMAIL)}, 'ACTIVE', 'USER', '{"locale":"en-US"}'::jsonb, '${STAMP}', '${STAMP}');`
)
w()

w("-- transaction_statuses (lookup global: 1 Paid / 2 Pending / 3 Overdue / 4 Scheduled)")
w(
  `INSERT INTO "transaction_statuses" ("id","COD_ST","STATUS","user_id","created_at","updated_at") VALUES\n` +
    defaultStatuses
      .map((st) => `  (${s(`st-${PREFIX}-${st.code}`)}, ${n(st.code)}, ${s(st.name)}, ${s(USER_ID)}, '${STAMP}', '${STAMP}')`)
      .join(",\n") +
    ";"
)
w()

w("-- category_groups")
w(
  `INSERT INTO "category_groups" ("id","COD_GRU","GRUPO","type","user_id","created_at","updated_at") VALUES\n` +
    defaultGroups
      .map(
        (g) =>
          `  (${s(groupUuidByCode[g.code])}, ${n(groupCodeOffset + g.code)}, ${s(g.name)}, '${g.type}', ${s(USER_ID)}, '${STAMP}', '${STAMP}')`
      )
      .join(",\n") +
    ";"
)
w()

w("-- categories")
w(
  `INSERT INTO "categories" ("id","COD_CAT","CATEGORIA","TIPO","group_id","user_id","created_at","updated_at") VALUES\n` +
    defaultCategories
      .map((c) => {
        const grp = defaultGroups.find((g) => g.id === c.groupId)!
        return `  (${s(`cat-${PREFIX}-${c.code}`)}, ${s(`${PREFIX}.${c.code}`)}, ${s(c.name)}, '${c.type}', ${s(groupUuidByCode[grp.code])}, ${s(USER_ID)}, '${STAMP}', '${STAMP}')`
      })
      .join(",\n") +
    ";"
)
w()

w("-- accounts")
w(
  `INSERT INTO "accounts" ("COD_ACC","CONTA","SLD_INI","DATA","user_id","active","TIPO","created_at","updated_at") VALUES\n` +
    defaultAccounts
      .map((a) => {
        const id = accountIds[a.type]
        const saldo = rows.accountBalances[id] ?? 0
        return `  (${n(id)}, ${s(a.name)}, ${n(saldo)}, '${STAMP}', ${s(USER_ID)}, true, '${a.type}', '${STAMP}', '${STAMP}')`
      })
      .join(",\n") +
    ";"
)
w()

const chunk = <T,>(arr: T[], size: number) => {
  const o: T[][] = []
  for (let i = 0; i < arr.length; i += size) o.push(arr.slice(i, i + size))
  return o
}

w(`-- payees (${rows.payees.length})`)
for (const part of chunk(rows.payees, 200)) {
  w(
    `INSERT INTO "payees" ("COD_BEN","BENEFICIARIO","user_id","created_at","updated_at") VALUES\n` +
      part.map((p) => `  (${n(p.id)}, ${s(p.name)}, ${s(USER_ID)}, '${STAMP}', '${STAMP}')`).join(",\n") +
      ";"
  )
}
w()

w(`-- transactions (${rows.transactions.length})`)
for (const part of chunk(rows.transactions, 500)) {
  w(
    `INSERT INTO "transactions" ("id","NUM","PERIODO","DATA","REF","HISTORICO","DESCRICAO","VALOR","TIPO","user_id","COD_ACC","COD_ACC_DEST","COD_GRU","COD_CAT","COD_ST","COD_BEN","created_at","updated_at") VALUES\n` +
      part
        .map(
          (t) =>
            `  (${s(t.id)}, ${n(t.num)}, ${s(t.period)}, ${d(t.date)}, ${s(t.reference)}, ${s(t.note)}, ${s(t.description)}, ${n(t.amount)}, '${t.type}', ${s(USER_ID)}, ${n(t.accountId)}, NULL, ${n(t.groupCode)}, ${s(t.categoryCode)}, ${n(t.statusCode)}, ${n(t.payeeId)}, '${STAMP}', '${STAMP}')`
        )
        .join(",\n") +
      ";"
  )
}
w()

w(`-- recurring_transactions (${rows.recurring.length})`)
w(
  `INSERT INTO "recurring_transactions" ("id","PERIODO","HISTORICO","DESCRICAO","VALOR","TIPO","user_id","COD_ACC","COD_GRU","COD_CAT","COD_ST","COD_BEN","last_date","REF","created_at","updated_at") VALUES\n` +
    rows.recurring
      .map(
        (r) =>
          `  (${s(r.id)}, ${s(r.period)}, ${s(r.note)}, ${s(r.description)}, ${n(r.amount)}, '${r.type}', ${s(USER_ID)}, ${n(r.accountId)}, ${n(r.groupCode)}, ${s(r.categoryCode)}, ${n(r.statusCode)}, ${n(r.payeeId)}, ${d(r.lastDate)}, ${s(r.reference)}, '${STAMP}', '${STAMP}')`
      )
      .join(",\n") +
    ";"
)
w()

w(`-- budgets (${rows.budgets.length})`)
w(
  `INSERT INTO "budgets" ("id","VALOR","month","year","group_id","category_id","user_id","GASTO","created_at","updated_at") VALUES\n` +
    rows.budgets
      .map(
        (b) =>
          `  (${s(b.id)}, ${n(b.amount)}, ${n(b.month)}, ${n(b.year)}, ${s(b.groupId)}, NULL, ${s(USER_ID)}, ${n(b.spent)}, '${STAMP}', '${STAMP}')`
      )
      .join(",\n") +
    ";"
)
w()
w("COMMIT;")
w()

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, out.join("\n"), "utf8")

const bytes = fs.statSync(OUT).size
console.log(`Gerado: ${OUT}  (${(bytes / 1024).toFixed(0)} KB)`)
console.log(`  corte realizado/em aberto: ${cutoffLabel}`)
console.log(`  usuario: ${USER_EMAIL} (prefixo ${PREFIX}, slotOffset ${SLOT})`)
console.log(
  `  linhas: users 1 | statuses ${defaultStatuses.length} | grupos ${defaultGroups.length} | categorias ${defaultCategories.length} | contas ${defaultAccounts.length} | payees ${rows.payees.length} | transactions ${rows.transactions.length} | recorrentes ${rows.recurring.length} | budgets ${rows.budgets.length}`
)
