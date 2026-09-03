import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * CORTE INICIAL DA DEMO — vitrine e cópias nascem com um fechamento que NÃO prende os vencidos.
 *
 * A demo planta de propósito duas despesas vencidas nos dias antes de ontem: pagar uma delas é o
 * gesto mais comum de quem visita. Se o corte fosse "ontem", esse gesto pediria PIN logo de cara.
 * Daí a regra: o corte é o dia ANTERIOR ao não pago mais antigo.
 *
 * "Não pago" é sempre pelo NOME do status (src/lib/paid-status.ts), nunca pelo código numérico.
 * O mock dos status abaixo copia o banco de verdade: os quatro códigos são GLOBAIS (COD_ST é
 * @unique) e a linha pertence à vitrine, não ao visitante — resolver o nome filtrando por
 * `userId` do phantom devolveria vazio, TUDO viraria "não pago" e o corte cairia anos atrás.
 */

const m = vi.hoisted(() => ({
  calls: [] as string[],
  statusRows: [
    { code: 1, name: "Paid", userId: "vitrine" },
    { code: 2, name: "Pending", userId: "vitrine" },
    { code: 3, name: "Overdue", userId: "vitrine" },
    { code: 4, name: "Scheduled", userId: "vitrine" },
  ],
  statusWhere: null as Record<string, unknown> | null,
  createdTransactions: [] as Array<{ date: Date; statusCode: number }>,
  prefWrites: [] as Array<{ executor: unknown; userId: string; key: string; patch: Record<string, unknown> }>,
  tx: null as unknown,
  groupOffset: 1_012_345,
  vitrineId: "vitrine" as string | null,
  settings: {} as Record<string, string>,
  vitrineTxs: [] as Array<{ id: string; date: Date; amount: number; type: string }>,
  statusUpdates: [] as Array<{ ids: string[]; statusCode: number }>,
  upserts: [] as Array<{ key: string; value: string }>,
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

vi.mock("@/lib/prisma", () => {
  const txClient = {
    $executeRaw: async (strings: TemplateStringsArray) => {
      m.calls.push(strings.join("?").includes("set_config") ? "set_config" : "$executeRaw")
      return 1
    },
    user: { create: async (args: Any) => { m.calls.push("user.create"); return args.data } },
    categoryGroup: {
      findMany: async () => {
        m.calls.push("categoryGroup.findMany")
        return [100, 200, 300, 400, 500, 600, 700, 800, 900].map((code) => ({
          id: `g-${code}`,
          code: m.groupOffset + code,
        }))
      },
    },
    payee: {
      aggregate: async () => ({ _max: { id: 0 } }),
      createMany: async (args: Any) => { m.calls.push("payee.createMany"); return { count: args.data.length } },
    },
    transaction: {
      createMany: async (args: Any) => {
        m.calls.push("transaction.createMany")
        m.createdTransactions = args.data.map((r: Any) => ({ date: r.date, statusCode: r.statusCode }))
        return { count: args.data.length }
      },
      updateMany: async (args: Any) => {
        m.calls.push("transaction.updateMany")
        m.statusUpdates.push({ ids: args.where.id.in, statusCode: args.data.statusCode })
        return { count: args.where.id.in.length }
      },
      findMany: async () => { m.calls.push("transaction.findMany"); return m.vitrineTxs },
    },
    recurringTransaction: { createMany: async (args: Any) => ({ count: args.data.length }) },
    budget: { createMany: async (args: Any) => ({ count: args.data.length }) },
    account: { update: async () => ({}) },
    transactionStatusLookup: {
      findMany: async (args: Any) => {
        m.calls.push("transactionStatusLookup.findMany")
        const where = (args?.where ?? {}) as Record<string, Any>
        m.statusWhere = where
        return m.statusRows
          .filter(
            (r) =>
              (where.userId === undefined || r.userId === where.userId) &&
              (where.code?.in === undefined || (where.code.in as number[]).includes(r.code)),
          )
          .map(({ code, name }) => ({ code, name }))
      },
    },
    appSetting: {
      upsert: async (args: Any) => {
        m.calls.push("appSetting.upsert")
        m.upserts.push({ key: args.where.key, value: args.update.value })
        return {}
      },
    },
  }
  m.tx = txClient
  const client = {
    ...txClient,
    user: {
      ...txClient.user,
      findUnique: async () => (m.vitrineId ? { id: m.vitrineId } : null),
    },
    appSetting: {
      ...txClient.appSetting,
      findUnique: async (args: Any) => {
        m.calls.push(`appSetting.findUnique:${args.where.key}`)
        const value = m.settings[args.where.key]
        return value === undefined ? null : { key: args.where.key, value }
      },
    },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(txClient),
  }
  return { prisma: client }
})

vi.mock("@/lib/user-init", () => ({
  initializeUserData: async () => {
    m.calls.push("initializeUserData")
    return { CHECKING: 9001, SAVINGS: 9002, WALLET: 9003 }
  },
}))

vi.mock("@/features/settings/services/user-preferences-write", () => ({
  mergeUserPreferenceKey: async (executor: unknown, userId: string, key: string, patch: Record<string, unknown>) => {
    m.calls.push("mergeUserPreferenceKey")
    m.prefWrites.push({ executor, userId, key, patch })
  },
  writeUserPreferenceKeys: async () => { m.calls.push("writeUserPreferenceKeys") },
}))

import { computeDemoClosedThrough } from "@/lib/demo-data/demo-closing"
import { provisionDemoVisitor } from "@/features/demo/services/provision-demo-visitor.service"
import { refreshVitrineCutoffIfDue } from "@/features/demo/services/refresh-vitrine-cutoff.service"
import { invalidateVitrineCache } from "@/features/demo/services/vitrine.service"
import { addDays, dayKeyOfStored, isDayKey } from "@/features/security/lib/date-closing"
import { isPaidStatusName } from "@/lib/paid-status"

/** Meio da tarde UTC, dentro da faixa do dataset (2025–2027). */
const NOW = new Date("2026-09-10T15:00:00.000Z")
const YESTERDAY = "2026-09-09"

beforeEach(() => {
  m.calls = []
  m.statusWhere = null
  m.createdTransactions = []
  m.prefWrites = []
  m.vitrineId = "vitrine"
  m.settings = {}
  m.vitrineTxs = []
  m.statusUpdates = []
  m.upserts = []
  invalidateVitrineCache()
})

describe("computeDemoClosedThrough", () => {
  it("sem não pagos, fecha até ontem (o mesmo corte do materializador)", () => {
    expect(computeDemoClosedThrough([], NOW)).toBe(YESTERDAY)
  })

  it("com não pagos, fecha até o dia ANTERIOR ao mais antigo deles", () => {
    const unpaid = [new Date("2026-09-20T12:00:00.000Z"), new Date("2026-09-05T12:00:00.000Z")]
    expect(computeDemoClosedThrough(unpaid, NOW)).toBe("2026-09-04")
  })

  it("nunca passa de ontem, mesmo com todos os não pagos no futuro", () => {
    expect(computeDemoClosedThrough([new Date("2026-09-25T12:00:00.000Z")], NOW)).toBe(YESTERDAY)
  })

  it("o dia é o UTC do lançamento (mesma derivação do materializador), não o local", () => {
    // 02:00Z de 10/09 ainda é 09/09 em America/New_York (fuso dos testes): quem lesse componentes
    // locais devolveria 2026-09-08 e adiantaria o corte um dia.
    expect(computeDemoClosedThrough([], new Date("2026-09-10T02:00:00.000Z"))).toBe(YESTERDAY)
  })
})

describe("provisionDemoVisitor: corte inicial da cópia", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => { vi.useRealTimers() })

  it("grava dateClosing DEPOIS das transações e DENTRO da mesma transação", async () => {
    await provisionDemoVisitor()
    const criou = m.calls.indexOf("transaction.createMany")
    const gravou = m.calls.indexOf("mergeUserPreferenceKey")
    expect(criou).toBeGreaterThanOrEqual(0)
    expect(gravou).toBeGreaterThan(criou)
    expect(m.prefWrites).toHaveLength(1)
    expect(m.prefWrites[0].key).toBe("dateClosing")
    // O executor é o cliente da transação, não o prisma solto: a escrita entra ou sai junto com as linhas.
    expect(m.prefWrites[0].executor).toBe(m.tx)
    expect(isDayKey(m.prefWrites[0].patch.closedThrough)).toBe(true)
    expect(m.prefWrites[0].patch.pinHash).toBeNull()
  })

  it("NENHUM não pago (pelo NOME do status) cai dentro do corte", async () => {
    await provisionDemoVisitor()
    const closedThrough = m.prefWrites[0].patch.closedThrough as string
    const nameByCode = Object.fromEntries(m.statusRows.map((s) => [s.code, s.name]))
    const naoPagos = m.createdTransactions.filter((t) => !isPaidStatusName(nameByCode[t.statusCode]))

    expect(m.createdTransactions.length).toBeGreaterThan(1000)
    expect(naoPagos.length).toBeGreaterThan(0)
    for (const t of naoPagos) {
      expect(dayKeyOfStored(t.date) > closedThrough).toBe(true)
    }
    // Os vencidos da vitrine (status "Overdue") continuam ABERTOS: é o gesto que a demo mostra.
    const vencidos = m.createdTransactions.filter((t) => nameByCode[t.statusCode] === "Overdue")
    expect(vencidos.length).toBe(2)
  })

  it("resolve o nome do status sem depender do dono da linha (COD_ST é global)", async () => {
    await provisionDemoVisitor()
    const closedThrough = m.prefWrites[0].patch.closedThrough as string
    const pagos = m.createdTransactions.filter((t) => dayKeyOfStored(t.date) <= closedThrough)
    // Filtrar os status pelo userId do phantom devolveria vazio: tudo viraria "não pago" e o corte
    // desabaria para o dia anterior ao primeiro lançamento do dataset (2025).
    expect(pagos.length).toBeGreaterThan(0)
    expect(closedThrough >= addDays(YESTERDAY, -7)).toBe(true)
    expect(closedThrough <= YESTERDAY).toBe(true)
    expect(m.statusWhere?.userId).toBeUndefined()
  })
})

describe("refreshVitrineCutoffIfDue", () => {
  const txv = (id: string, date: string, amount: number, type: "INCOME" | "EXPENSE") => ({
    id, date: new Date(date), amount, type,
  })

  it("devolve 'skipped' quando a marca .v2 já é de hoje", async () => {
    m.settings["demo.vitrineCutoffDay.v2"] = "2026-09-10"
    expect(await refreshVitrineCutoffIfDue(NOW)).toBe("skipped")
    expect(m.calls).not.toContain("mergeUserPreferenceKey")
    expect(m.calls).not.toContain("transaction.updateMany")
  })

  it("a marca ANTIGA de hoje não conta: a chave da vez é a .v2", async () => {
    m.settings["demo.vitrineCutoffDay"] = "2026-09-10"
    m.vitrineTxs = [txv("a", "2026-09-01T12:00:00.000Z", -500, "EXPENSE")]
    expect(await refreshVitrineCutoffIfDue(NOW)).toBe("refreshed")
    expect(m.upserts).toEqual([{ key: "demo.vitrineCutoffDay.v2", value: "2026-09-10" }])
  })

  it("devolve 'skipped' quando não há vitrine", async () => {
    m.vitrineId = null
    expect(await refreshVitrineCutoffIfDue(NOW)).toBe("skipped")
    expect(m.calls).not.toContain("mergeUserPreferenceKey")
  })

  it("grava o corte dentro da transação, depois do set_config e antes da marca", async () => {
    m.vitrineTxs = [
      txv("velha", "2026-09-01T12:00:00.000Z", -500, "EXPENSE"),
      txv("vencida-menor", "2026-09-08T12:00:00.000Z", -50, "EXPENSE"),
      txv("vencida-media", "2026-09-07T12:00:00.000Z", -120, "EXPENSE"),
      txv("futura", "2026-09-20T12:00:00.000Z", -80, "EXPENSE"),
    ]
    expect(await refreshVitrineCutoffIfDue(NOW)).toBe("refreshed")

    const licenca = m.calls.indexOf("set_config")
    const gravou = m.calls.indexOf("mergeUserPreferenceKey")
    const marca = m.calls.indexOf("appSetting.upsert")
    expect(licenca).toBeGreaterThanOrEqual(0)
    expect(gravou).toBeGreaterThan(licenca)
    expect(marca).toBeGreaterThan(gravou)

    expect(m.prefWrites).toHaveLength(1)
    expect(m.prefWrites[0].executor).toBe(m.tx)
    expect(m.prefWrites[0].userId).toBe("vitrine")
    expect(m.prefWrites[0].key).toBe("dateClosing")
    // Não pagos = vencidas (07 e 08/09) + pendente (20/09). O mais antigo é 07/09.
    expect(m.prefWrites[0].patch.closedThrough).toBe("2026-09-06")
  })

  it("sem lançamento nenhum, o corte é ontem", async () => {
    m.vitrineTxs = []
    expect(await refreshVitrineCutoffIfDue(NOW)).toBe("refreshed")
    expect(m.prefWrites[0].patch.closedThrough).toBe(YESTERDAY)
  })
})
