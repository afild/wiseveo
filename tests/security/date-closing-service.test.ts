import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Serviço de fechamento de datas: a guarda que TODO escritor chama (assertWritable), o fechar,
 * o reabrir e a busca de bloqueadores. O Prisma é substituído por um objeto: nenhum banco é tocado.
 */
const m = vi.hoisted(() => ({
  closing: {} as Record<string, unknown>,
  unpaidCount: 0,
  earliest: new Date("2024-10-03T12:00:00.000Z") as Date | null,
  raw: [] as Array<{ sql: string; values: unknown[] }>,
  countWhere: null as unknown,
}))
import { sqlText } from "./helpers/sql-text"

const NOW = new Date("2026-09-02T12:00:00.000Z")

vi.mock("@/lib/prisma", () => {
  const client = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = sqlText(strings, values); m.raw.push({ sql, values })
      if (sql.includes("information_schema")) return [{ data_type: "jsonb" }]
      return [{ dc: m.closing }]
    },
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => { m.raw.push({ sql: sqlText(strings, values), values }); return 1 },
    transaction: {
      count: async (args: unknown) => { m.countWhere = args; return m.unpaidCount },
      findMany: async () => [],
      aggregate: async (args: { _min?: unknown }) => (args._min ? { _min: { date: m.earliest }, _max: { date: null } } : { _min: { date: null }, _max: { date: null } }),
    },
  }
  return { prisma: { ...client, $transaction: async (fn: (tx: typeof client) => unknown) => fn(client) } }
})
vi.mock("@/lib/paid-status", () => ({ unpaidStatusFilter: () => ({ NOT: { statusLookup: { is: { name: "PAID" } } } }) }))

import { prisma as tx } from "@/lib/prisma" // o mock acima: serve de "transação" nos testes
import { assertWritable, closeThrough, countProtected, countTransactionsBetween, findUnpaidBlockers, getDateClosingState, reopenFrom } from "@/features/security/services/date-closing.service"
import type { WriteContext } from "@/features/security/services/write-context"

const owner: WriteContext = { actorUserId: "dono", ownerId: "dono", role: "SUPERADMIN", status: "ACTIVE", showcase: false, override: null }
const guest: WriteContext = { ...owner, actorUserId: "convidado", role: "USER" }

beforeEach(() => { m.closing = { closedThrough: "2026-08-31", pinHash: "h" }; m.unpaidCount = 0; m.earliest = new Date("2024-10-03T12:00:00.000Z"); m.raw = []; m.countWhere = null })

describe("assertWritable", () => {
  it("dia aberto passa", async () => { await expect(assertWritable(tx as never, owner, { days: ["2026-09-01"] })).resolves.toBeDefined() })
  it("dia fechado lança 423 com canOverride pelo ator", async () => {
    await expect(assertWritable(tx, owner, { days: ["2026-08-31"] })).rejects.toMatchObject({ code: "DATE_CLOSED", days: ["2026-08-31"], canOverride: true })
    await expect(assertWritable(tx, guest, { days: ["2026-08-31"] })).rejects.toMatchObject({ canOverride: false })
  })
  it("competência de mês fechado lança, inclusive ao SAIR do mês fechado", async () => {
    await expect(assertWritable(tx, owner, { days: ["2026-09-05"], periods: ["202608", "202609"] })).rejects.toMatchObject({ periods: ["202608"] })
  })
  it("override válido do mesmo dono e pessoa passa", async () => {
    await expect(assertWritable(tx, { ...owner, override: { ownerId: "dono", userId: "dono" } }, { days: ["2026-08-31"] })).resolves.toBeDefined()
  })
  it("lê a linha do dono com FOR SHARE", async () => {
    await assertWritable(tx, owner, { days: ["2026-09-01"] })
    expect(m.raw.some((c) => c.sql.includes("FOR SHARE"))).toBe(true)
  })
  /** Sem corte não há o que checar: nem dia nem competência devolvem bloqueio. */
  it("banco sem fechamento nenhum deixa passar qualquer dia", async () => {
    m.closing = {}
    await expect(assertWritable(tx, owner, { days: ["1999-01-01"], periods: ["199901"] })).resolves.toMatchObject({ closedThrough: null })
  })
  it("dia inválido ou vazio é ignorado, não vira bloqueio", async () => {
    await expect(assertWritable(tx, owner, { days: [null, undefined, "não é dia"], periods: ["20260"] })).resolves.toBeDefined()
  })
})

describe("closeThrough (relógio fixo em NOW: os testes não dependem da máquina)", () => {
  it("recusa quem não pode fechar", async () => {
    await expect(closeThrough(guest, { through: "2026-09-01", today: "2026-09-02" }, NOW)).rejects.toMatchObject({ code: "forbidden", status: 403 })
  })
  it("recusa data depois de hoje (tolerância de 1 dia sobre o UTC do servidor)", async () => {
    await expect(closeThrough(owner, { through: "2030-01-01", today: "2026-09-02" }, NOW)).rejects.toMatchObject({ code: "invalidToday", status: 400 })
    await expect(closeThrough(owner, { through: "2026-09-04", today: "2026-09-04" }, NOW)).rejects.toMatchObject({ code: "invalidToday" })
  })
  it("sem PIN responde pinNotSet", async () => {
    m.closing = { closedThrough: null }
    await expect(closeThrough(owner, { through: "2026-09-01", today: "2026-09-02" }, NOW)).rejects.toMatchObject({ code: "pinNotSet", status: 428 })
  })
  it("X < corte é recusado; X == corte não faz nada", async () => {
    await expect(closeThrough(owner, { through: "2026-08-30", today: "2026-09-02" }, NOW)).rejects.toMatchObject({ code: "closeWouldReopen" })
    expect(await closeThrough(owner, { through: "2026-08-31", today: "2026-09-02" }, NOW)).toEqual({ closedThrough: "2026-08-31", changed: false })
  })
  it("confere não pagos só na faixa (corte, X], trava o dono com FOR UPDATE e grava por mesclagem", async () => {
    expect(await closeThrough(owner, { through: "2026-09-01", today: "2026-09-02" }, NOW)).toEqual({ closedThrough: "2026-09-01", changed: true })
    expect(JSON.stringify(m.countWhere)).toContain("2026-08-31T23:59:59.999Z")
    expect(m.raw.some((c) => c.sql.includes("FOR UPDATE"))).toBe(true)
    expect(m.raw.some((c) => c.sql.includes(JSON.stringify({ closedThrough: "2026-09-01" })))).toBe(true)
  })
  /**
   * A trava do dono é a ÚNICA forma forte aqui: createTransaction pega LOCK TABLE em transactions
   * e só depois lê a linha do dono; qualquer FOR UPDATE/FOR SHARE em transactions deste lado
   * fecharia o ciclo do impasse (desenho, seção 5).
   */
  it("nunca trava a tabela de lançamentos (só a linha do dono)", async () => {
    await closeThrough(owner, { through: "2026-09-01", today: "2026-09-02" }, NOW)
    expect(m.raw.some((c) => /LOCK TABLE|FOR SHARE/.test(c.sql))).toBe(false)
    expect(m.raw.filter((c) => c.sql.includes("FOR UPDATE"))).toHaveLength(1)
  })
  it("com bloqueadores recusa e devolve a lista", async () => {
    m.unpaidCount = 3
    await expect(closeThrough(owner, { through: "2026-09-01", today: "2026-09-02" }, NOW)).rejects.toMatchObject({ code: "unpaidBlockers", status: 409, extra: { count: 3 } })
  })
})

describe("findUnpaidBlockers", () => {
  /** Não pago que já está DENTRO do corte não pode travar o fechamento seguinte: a faixa é aberta embaixo. */
  it("a faixa começa DEPOIS do corte e termina no fim do dia X", async () => {
    await findUnpaidBlockers(tx, "dono", "2026-08-31", "2026-09-01")
    expect(JSON.stringify(m.countWhere)).toContain(`"gt":"2026-08-31T23:59:59.999Z"`)
    expect(JSON.stringify(m.countWhere)).toContain(`"lte":"2026-09-01T23:59:59.999Z"`)
  })
  it("sem corte, olha desde o início (sem limite inferior)", async () => {
    await findUnpaidBlockers(tx, "dono", null, "2026-09-01")
    expect(JSON.stringify(m.countWhere)).not.toContain(`"gt"`)
  })
})

describe("reopenFrom", () => {
  it("sem token responde pinRequired", async () => {
    await expect(reopenFrom(owner, "2026-08-01")).rejects.toMatchObject({ code: "pinRequired", status: 401 })
  })
  it("D depois do corte é recusado", async () => {
    await expect(reopenFrom({ ...owner, override: { ownerId: "dono", userId: "dono" } }, "2026-09-05")).rejects.toMatchObject({ code: "nothingToReopen" })
  })
  it("reabre para D-1 e cai em vazio antes do primeiro lançamento", async () => {
    const ctx = { ...owner, override: { ownerId: "dono", userId: "dono" } }
    expect(await reopenFrom(ctx, "2026-08-01")).toEqual({ closedThrough: "2026-07-31", changed: true })
    expect(await reopenFrom(ctx, "2024-10-03")).toEqual({ closedThrough: null, changed: true })
  })
  it("quem não pode fechar também não reabre", async () => {
    await expect(reopenFrom({ ...guest, override: { ownerId: "dono", userId: "convidado" } }, "2026-08-01")).rejects.toMatchObject({ code: "forbidden", status: 403 })
  })
})

describe("estado e contagens auxiliares", () => {
  it("getDateClosingState devolve o corte, se há PIN e o que o ator pode", async () => {
    expect(await getDateClosingState(owner)).toEqual({ closedThrough: "2026-08-31", hasPin: true, canManageClosing: true, canManagePin: true, showcase: false })
    expect(await getDateClosingState(guest)).toMatchObject({ canManageClosing: false, canManagePin: false })
  })
  it("countTransactionsBetween conta tudo e os não pagos na mesma faixa", async () => {
    m.unpaidCount = 2
    expect(await countTransactionsBetween("dono", "2026-08-31", "2026-09-01")).toEqual({ total: 2, unpaid: 2, firstDate: "2024-10-03", lastDate: null })
  })
  it("countProtected é zero quando D está depois do corte", async () => {
    expect(await countProtected(owner, "2026-09-05")).toEqual({ count: 0, closedThrough: "2026-08-31" })
  })
  it("countProtected conta de D-1 (exclusivo) até o corte", async () => {
    m.unpaidCount = 7
    expect(await countProtected(owner, "2026-08-01")).toEqual({ count: 7, closedThrough: "2026-08-31" })
    expect(JSON.stringify(m.countWhere)).toContain(`"gt":"2026-07-31T23:59:59.999Z"`)
  })
})
