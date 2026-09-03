import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Trava de datas DENTRO dos sete serviços de lançamento: nenhum grava em dia (ou competência)
 * fechado sem token de PIN, e a checagem roda na MESMA transação da escrita. O Prisma é um
 * objeto: nenhum banco é tocado.
 */
const m = vi.hoisted(() => ({
  closing: {} as Record<string, unknown>,
  existing: null as Record<string, unknown> | null,
  /** Cada passo do banco com o cliente por onde saiu: "tx" só existe dentro de $transaction. */
  calls: [] as Array<{ via: "global" | "tx"; op: string }>,
  created: [] as Record<string, unknown>[],
  updated: [] as Record<string, unknown>[],
}))
import { sqlText } from "./helpers/sql-text"

/** Linha de partida: 20/08/2026, dentro do corte. */
const ROW = {
  id: "t1",
  num: 40,
  period: "202608",
  date: new Date("2026-08-20T12:00:00.000Z"),
  reference: null,
  note: null,
  description: "aluguel",
  amount: -100,
  type: "EXPENSE" as const,
  userId: "dono",
  accountId: 1,
  destAccountId: null,
  groupCode: 3,
  categoryCode: "3.1",
  statusCode: 2,
  payeeId: null,
}

vi.mock("@/lib/prisma", () => {
  /**
   * Cliente MARCADO: o de dentro da transação é outro objeto, e cada passo registra por onde
   * saiu. Com um cliente só, uma guarda movida para fora da transação passaria despercebida.
   * As LEITURAS também registram: sem isso, a data lida fora da transação (que a guarda depois
   * confere) escapava do teste, porque só as escritas apareciam em `m.calls`.
   */
  const makeClient = (via: "global" | "tx") => ({
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = sqlText(strings, values)
      m.calls.push({ via, op: sql })
      if (sql.includes("dateClosing")) return [{ dc: m.closing }]
      if (sql.includes("next_num")) return [{ next_num: 41 }]
      if (sql.includes("next_id")) return [{ next_id: 7 }]
      return []
    },
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      m.calls.push({ via, op: sqlText(strings, values) })
      return 1
    },
    transaction: {
      findFirst: async () => {
        m.calls.push({ via, op: "transaction.findFirst" })
        return m.existing
      },
      findUnique: async () => {
        m.calls.push({ via, op: "transaction.findUnique" })
        return m.existing
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        m.calls.push({ via, op: "transaction.create" })
        m.created.push(data)
        return data
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        m.calls.push({ via, op: "transaction.update" })
        m.updated.push(data)
        return { ...m.existing, ...data }
      },
      delete: async () => {
        m.calls.push({ via, op: "transaction.delete" })
        return m.existing
      },
    },
    category: {
      findUnique: async () => {
        m.calls.push({ via, op: "category.findUnique" })
        return { type: "EXPENSE" }
      },
    },
    payee: {
      findFirst: async () => {
        m.calls.push({ via, op: "payee.findFirst" })
        return null
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        m.calls.push({ via, op: "payee.create" })
        return data
      },
    },
    excludedTransaction: {
      deleteMany: async () => {
        m.calls.push({ via, op: "excluded.deleteMany" })
        return { count: 0 }
      },
      create: async () => {
        m.calls.push({ via, op: "excluded.create" })
        return {}
      },
    },
    account: {
      findFirst: async () => {
        m.calls.push({ via, op: "account.findFirst" })
        return { id: 1 }
      },
    },
    transactionStatusLookup: {
      findFirst: async () => {
        m.calls.push({ via, op: "statusLookup.findFirst" })
        return { code: 2 }
      },
    },
  })
  const client = makeClient("global")
  const txClient = makeClient("tx")
  return { prisma: { ...client, $transaction: async (fn: (tx: typeof txClient) => unknown) => fn(txClient) } }
})
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }))
vi.mock("@/features/settings/services/user-settings-service", () => ({
  getUserQuickPaymentSettings: async () => ({ defaultAccountId: 1, defaultStatusCode: 2 }),
}))

import { periodFromDate } from "@/lib/financial"
import { DateClosedError } from "@/features/security/lib/http"
import type { WriteContext } from "@/features/security/services/write-context"
import { copyTransaction } from "@/features/transactions/services/copy-transaction"
import { createTransaction } from "@/features/transactions/services/create-transaction"
import { excludeTransaction } from "@/features/transactions/services/exclude-transaction"
import { quickPayTransaction } from "@/features/transactions/services/quick-pay-transaction"
import { updateTransaction } from "@/features/transactions/services/update-transaction"
import { updateTransactionDate } from "@/features/transactions/services/update-transaction-date"
import { updateTransactionPeriod } from "@/features/transactions/services/update-transaction-period"

const owner: WriteContext = { actorUserId: "dono", ownerId: "dono", role: "SUPERADMIN", status: "ACTIVE", showcase: false, override: null }
const withPin: WriteContext = { ...owner, override: { ownerId: "dono", userId: "dono" } }

const ops = () => m.calls.map((c) => c.op)

/**
 * A conferência só é atômica se sair pelo cliente da TRANSAÇÃO. Se alguém passar o cliente global
 * para `assertWritable`, o tipo aceita (é estrutural) e o teste é o único que enxerga.
 */
function expectGuardInsideTransaction() {
  const guard = m.calls.filter((c) => c.op.includes("FOR SHARE"))
  expect(guard.length).toBeGreaterThan(0)
  expect(guard.map((c) => c.via)).toEqual(guard.map(() => "tx"))
}

/**
 * Conferir na transação certa não basta: a DATA conferida também tem de sair do cliente da
 * transação. Lida pelo cliente global, ela pode chegar velha — outra requisição move a linha entre
 * a leitura e a escrita — e o dia fechado passa batido.
 */
function expectRowReadInsideTransaction() {
  const reads = m.calls.filter((c) => c.op === "transaction.findFirst" || c.op === "transaction.findUnique")
  expect(reads.length).toBeGreaterThan(0)
  expect(reads.map((c) => c.via)).toEqual(reads.map(() => "tx"))
}

const CLOSED = "2026-08-20"
const OPEN = "2026-09-05"
const openRow = () => ({ ...ROW, date: new Date("2026-09-05T12:00:00.000Z"), period: "202609" })

const createInput = (date: string, period?: string) => ({
  userId: "dono",
  date,
  period,
  amount: 100,
  type: "EXPENSE" as const,
  accountId: 1,
  groupCode: 3,
  categoryCode: "3.1",
  statusCode: 2,
})
const updateInput = (date: string, period?: string) => ({ id: "t1", ...createInput(date, period) })

beforeEach(() => {
  m.closing = { closedThrough: "2026-08-31", pinHash: "h" }
  m.existing = { ...ROW }
  m.calls = []
  m.created = []
  m.updated = []
})

describe("createTransaction", () => {
  it("dia fechado lança e não grava; dia aberto e PIN gravam", async () => {
    await expect(createTransaction(createInput(CLOSED), owner)).rejects.toBeInstanceOf(DateClosedError)
    expect(m.created).toHaveLength(0)
    await expect(createTransaction(createInput(OPEN), owner)).resolves.toBeDefined()
    await expect(createTransaction(createInput(CLOSED), withPin)).resolves.toBeDefined()
    expect(m.created).toHaveLength(2)
    expectGuardInsideTransaction()
  })

  it("competência fechada lança mesmo com o dia aberto", async () => {
    await expect(createTransaction(createInput(OPEN, "202607"), owner)).rejects.toMatchObject({ periods: ["202607"] })
    expect(m.created).toHaveLength(0)
  })

  /** LOCK TABLE primeiro, linha do dono depois: inverter fecha o ciclo do impasse (desenho, seção 5). */
  it("a guarda roda DEPOIS do LOCK TABLE, na mesma transação", async () => {
    await createTransaction(createInput(OPEN), owner)
    const lock = m.calls.findIndex((c) => c.op.includes("LOCK TABLE"))
    const share = m.calls.findIndex((c) => c.op.includes("FOR SHARE"))
    const write = ops().indexOf("transaction.create")
    expect(lock).toBeGreaterThanOrEqual(0)
    expect(share).toBeGreaterThan(lock)
    expect(write).toBeGreaterThan(share)
  })

  it("sem competência, grava o mês da DATA e não o mês corrente", async () => {
    m.closing = {}
    await createTransaction(createInput("2019-03-07"), owner)
    expect(m.created[0].period).toBe("201903")
    expect(m.created[0].period).not.toBe(periodFromDate())
  })
})

describe("updateTransaction", () => {
  it("confere o dia atual E o dia novo; com PIN passa", async () => {
    await expect(updateTransaction(updateInput(OPEN), owner)).rejects.toMatchObject({ days: [CLOSED] })
    expect(m.updated).toHaveLength(0)

    m.existing = openRow()
    await expect(updateTransaction(updateInput(CLOSED), owner)).rejects.toMatchObject({ days: [CLOSED] })
    await expect(updateTransaction(updateInput(OPEN), owner)).resolves.toBeDefined()

    m.existing = { ...ROW }
    await expect(updateTransaction(updateInput(CLOSED), withPin)).resolves.toBeDefined()
    expect(m.updated).toHaveLength(2)
    expectGuardInsideTransaction()
    expectRowReadInsideTransaction()
  })

  /** Tirar um lançamento de um mês fechado é escrita no mês fechado: a competência atual conta. */
  it("competência atual e nova entram na conta", async () => {
    m.existing = { ...openRow(), period: "202607" }
    await expect(updateTransaction(updateInput(OPEN, "202609"), owner)).rejects.toMatchObject({ periods: ["202607"] })
    m.existing = openRow()
    await expect(updateTransaction(updateInput(OPEN, "202608"), owner)).rejects.toMatchObject({ periods: ["202608"] })
  })

  /**
   * A coluna é `char(6)` e o banco do dono tem anos de histórico: competência com padding, vazia
   * ou fora do formato NÃO pode derrubar uma edição comum. O dia da própria linha continua
   * conferido, que é a proteção de verdade. Isto vale só para o que já está gravado; competência
   * vinda da requisição segue barrada com 400 na rota.
   */
  it("competência legada do banco não derruba a edição", async () => {
    for (const legacy of ["20268 ", "      ", "000000"]) {
      m.existing = { ...openRow(), period: legacy }
      await expect(updateTransaction(updateInput(OPEN), owner)).resolves.toBeDefined()
    }
    expect(m.updated).toHaveLength(3)
  })
})

describe("updateTransactionDate", () => {
  it("confere o dia atual E o dia novo; com PIN passa", async () => {
    await expect(updateTransactionDate("t1", "dono", OPEN, owner)).rejects.toMatchObject({ days: [CLOSED] })
    expect(m.updated).toHaveLength(0)

    m.existing = openRow()
    await expect(updateTransactionDate("t1", "dono", CLOSED, owner)).rejects.toMatchObject({ days: [CLOSED] })
    await expect(updateTransactionDate("t1", "dono", OPEN, owner)).resolves.toBeDefined()
    await expect(updateTransactionDate("t1", "dono", CLOSED, withPin)).resolves.toBeDefined()
    expect(m.updated).toHaveLength(2)
    expectGuardInsideTransaction()
    expectRowReadInsideTransaction()
  })
})

describe("updateTransactionPeriod", () => {
  it("confere o dia da linha e as duas competências; com PIN passa", async () => {
    await expect(updateTransactionPeriod("t1", "dono", "202609", owner)).rejects.toMatchObject({ days: [CLOSED] })
    expect(m.updated).toHaveLength(0)

    m.existing = { ...openRow(), period: "202607" }
    await expect(updateTransactionPeriod("t1", "dono", "202609", owner)).rejects.toMatchObject({ periods: ["202607"] })

    m.existing = openRow()
    await expect(updateTransactionPeriod("t1", "dono", "202608", owner)).rejects.toMatchObject({ periods: ["202608"] })
    await expect(updateTransactionPeriod("t1", "dono", "202609", owner)).resolves.toBeDefined()
    await expect(updateTransactionPeriod("t1", "dono", "202608", withPin)).resolves.toBeDefined()
    expect(m.updated).toHaveLength(2)
    expectGuardInsideTransaction()
    expectRowReadInsideTransaction()
  })

  /** Mesma tolerância do `updateTransaction`: competência legada do banco não vira erro interno. */
  it("competência legada do banco não derruba a troca de competência", async () => {
    m.existing = { ...openRow(), period: "20268 " }
    await expect(updateTransactionPeriod("t1", "dono", "202609", owner)).resolves.toBeDefined()
    expect(m.updated).toHaveLength(1)
  })
})

describe("quickPayTransaction", () => {
  it("dia fechado lança e não paga; dia aberto e PIN pagam", async () => {
    await expect(quickPayTransaction("t1", "dono", owner)).rejects.toBeInstanceOf(DateClosedError)
    expect(m.updated).toHaveLength(0)
    await expect(quickPayTransaction("t1", "dono", withPin)).resolves.toMatchObject({ success: true })
    m.existing = openRow()
    await expect(quickPayTransaction("t1", "dono", owner)).resolves.toMatchObject({ success: true })
    expect(m.updated).toHaveLength(2)
    expectGuardInsideTransaction()
    expectRowReadInsideTransaction()
  })

  /**
   * O detalhe que o teste antes não via: a linha é lida DENTRO da transação que grava. Ler antes
   * dela devolve uma data que pode não valer mais, e a guarda aprova um dia que já foi fechado.
   */
  it("lê a data da linha dentro da transação da escrita, e antes da guarda", async () => {
    m.existing = openRow()
    await quickPayTransaction("t1", "dono", owner)
    const read = m.calls.findIndex((c) => c.op === "transaction.findFirst")
    const share = m.calls.findIndex((c) => c.op.includes("FOR SHARE"))
    expect(read).toBeGreaterThanOrEqual(0)
    expect(m.calls[read].via).toBe("tx")
    expect(share).toBeGreaterThan(read)
    expect(ops().indexOf("transaction.update")).toBeGreaterThan(share)
  })
})

describe("excludeTransaction", () => {
  it("dia fechado lança e não apaga; dia aberto e PIN apagam", async () => {
    await expect(excludeTransaction("t1", "dono", owner)).rejects.toBeInstanceOf(DateClosedError)
    expect(ops()).not.toContain("transaction.delete")
    await expect(excludeTransaction("t1", "dono", withPin)).resolves.toMatchObject({ success: true })
    expect(ops()).toContain("transaction.delete")
    expectGuardInsideTransaction()
    expectRowReadInsideTransaction()
  })
})

describe("copyTransaction", () => {
  it("repassa o contexto: o dia de DESTINO manda, mesmo copiando de dia fechado", async () => {
    await expect(copyTransaction("t1", CLOSED, "dono", owner)).rejects.toBeInstanceOf(DateClosedError)
    expect(m.created).toHaveLength(0)
    await expect(copyTransaction("t1", OPEN, "dono", owner)).resolves.toBeDefined()
    await expect(copyTransaction("t1", CLOSED, "dono", withPin)).resolves.toBeDefined()
    expect(m.created).toHaveLength(2)
    expectGuardInsideTransaction()
  })

  /**
   * Exceção consciente: a cópia lê a ORIGINAL pelo cliente global, fora de transação. Não é furo —
   * a data da original não entra na conta da guarda; quem manda é o dia de DESTINO, conferido
   * dentro da transação do createTransaction.
   */
  it("a leitura da original fica fora da transação de propósito: vale o dia de destino", async () => {
    await copyTransaction("t1", OPEN, "dono", owner)
    expect(m.calls.filter((c) => c.op === "transaction.findUnique").map((c) => c.via)).toEqual(["global"])
    expectGuardInsideTransaction()
  })
})
