import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

/**
 * Contrato 423 fora das sete rotas de lançamento: notas, anexos e "lançar recorrente". Todas
 * respondem 423 (nunca 500) em dia fechado, e a conferência sai pelo cliente da TRANSAÇÃO que
 * grava. Lançar recorrente é o caso à parte: nem com token de PIN ele passa, porque repetiria o
 * lançamento dentro do período fechado; a janela oferece outra data. Prisma e contexto de escrita
 * são objetos: nenhum banco é tocado.
 */
const m = vi.hoisted(() => ({
  ctx: null as unknown,
  /** Opções com que a rota montou o contexto: o launch precisa descartar o token. */
  ctxOpts: [] as unknown[],
  closed: false,
  row: null as Record<string, unknown> | null,
  recurring: null as Record<string, unknown> | null,
  /** Cada conferência com o cliente por onde saiu ("tx" só existe dentro de $transaction). */
  guardCalls: [] as Array<{ via: unknown; days: unknown; periods: unknown }>,
  writes: [] as string[],
  recurringUpdates: [] as Record<string, unknown>[],
  launchArgs: [] as Record<string, unknown>[],
}))

import { sqlText } from "./helpers/sql-text"

vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }))

vi.mock("@/features/security/services/write-context", () => ({
  getWriteContext: async (_request: Request, opts?: unknown) => {
    m.ctxOpts.push(opts)
    return m.ctx
  },
}))

vi.mock("@/features/security/services/date-closing.service", () => ({
  assertWritable: async (tx: { __via?: string }, _ctx: unknown, input: { days: unknown; periods?: unknown }) => {
    m.guardCalls.push({ via: tx?.__via, days: input.days, periods: input.periods })
    if (m.closed) throw new DateClosedError([CLOSED_DAY], [], CLOSED_DAY, true)
    return {}
  },
}))

vi.mock("@/features/transactions/services/create-transaction", () => ({
  createTransaction: async (input: Record<string, unknown>) => {
    m.launchArgs.push(input)
    if (m.closed) throw new DateClosedError([CLOSED_DAY], [], CLOSED_DAY, true)
    return { id: "novo", date: new Date(`${String(input.date)}T12:00:00.000Z`) }
  },
}))

vi.mock("@/lib/prisma", () => {
  /** Cliente MARCADO: o de dentro da transação é outro objeto, e cada escrita diz por onde saiu. */
  const make = (via: "global" | "tx") => ({
    __via: via,
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = sqlText(strings, values)
      const isDelete = sql.includes("DELETE FROM")
      m.writes.push(`${via}:${isDelete ? "message.delete" : "message.insert"}`)
      return isDelete
        ? [{ id: "msg1" }]
        : [{ id: "msg1", content: "oi", createdAt: new Date("2026-08-20T12:00:00.000Z"), userId: "dono", userName: "Dono" }]
    },
    transaction: { findFirst: async () => m.row },
    transactionAttachment: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        m.writes.push(`${via}:attachment.create`)
        return { id: data.id, fileName: data.fileName, mimeType: data.mimeType, fileSize: data.fileSize }
      },
      findFirst: async () => ({ id: "a1" }),
      delete: async () => {
        m.writes.push(`${via}:attachment.delete`)
        return { id: "a1" }
      },
    },
    recurringTransaction: {
      findFirst: async () => m.recurring,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        m.recurringUpdates.push(data)
        return data
      },
    },
  })
  const client = make("global")
  const txClient = make("tx")
  return { prisma: { ...client, $transaction: async (fn: (tx: typeof txClient) => unknown) => fn(txClient) } }
})

import { DATE_CLOSED_HEADER, DateClosedError } from "@/features/security/lib/http"
import type { WriteContext } from "@/features/security/services/write-context"
import { POST as messagePost } from "@/app/api/transactions/[id]/messages/route"
import { DELETE as messageDelete } from "@/app/api/transactions/[id]/messages/[messageId]/route"
import { POST as attachmentPost } from "@/app/api/transactions/[id]/attachments/route"
import { DELETE as attachmentDelete } from "@/app/api/transactions/[id]/attachments/[attachmentId]/route"
import { POST as launchPost } from "@/app/api/recurring-transactions/[id]/launch/route"

const OWNER: WriteContext = {
  actorUserId: "dono",
  ownerId: "dono",
  role: "SUPERADMIN",
  status: "ACTIVE",
  showcase: false,
  override: null,
}
/** Dono com token de PIN válido: destrava tudo, MENOS lançar recorrente. */
const WITH_PIN: WriteContext = { ...OWNER, override: { ownerId: "dono", userId: "dono" } }

const CLOSED_DAY = "2026-08-31"
const ROW_DAY = "2026-08-20"
const ROW = { id: "t1", date: new Date(`${ROW_DAY}T12:00:00.000Z`) }
const OTHER_DAY = "2026-09-10"

function jsonReq(path: string, body?: Record<string, unknown>) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

function deleteReq(path: string) {
  return new NextRequest(`http://localhost:3000${path}`, { method: "DELETE" })
}

function filesReq(names: string[]) {
  const form = new FormData()
  for (const name of names) {
    form.append("files", new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" }))
  }
  return new NextRequest("http://localhost:3000/api/transactions/t1/attachments", { method: "POST", body: form })
}

const txRoute = { params: Promise.resolve({ id: "t1" }) }
const messageRoute = { params: Promise.resolve({ id: "t1", messageId: "msg1" }) }
const attachmentRoute = { params: Promise.resolve({ id: "t1", attachmentId: "a1" }) }

/** O contrato do fio, inteiro. `canOverride` é argumento porque o launch nunca oferece o PIN. */
async function expectLocked(res: Response, canOverride = true) {
  expect(res.status).toBe(423)
  expect(res.headers.get(DATE_CLOSED_HEADER)).toBe("1")
  expect(await res.json()).toMatchObject({
    code: "DATE_CLOSED",
    days: [CLOSED_DAY],
    periods: [],
    closedThrough: CLOSED_DAY,
    canOverride,
  })
}

/** A conferência só é atômica se sair pelo cliente da transação, e antes de qualquer escrita. */
function expectGuardInsideTransaction() {
  expect(m.guardCalls.length).toBeGreaterThan(0)
  expect(m.guardCalls.map((c) => c.via)).toEqual(m.guardCalls.map(() => "tx"))
  expect(m.writes.length).toBeGreaterThan(0)
  expect(m.writes.map((w) => w.split(":")[0])).toEqual(m.writes.map(() => "tx"))
}

beforeEach(() => {
  m.ctx = OWNER
  m.ctxOpts = []
  m.closed = false
  m.row = { ...ROW }
  m.recurring = {
    id: "r1",
    note: null,
    description: "aluguel",
    amount: 100,
    type: "EXPENSE",
    accountId: 1,
    groupCode: 3,
    categoryCode: "3.1",
    statusCode: 2,
    payeeId: null,
    reference: null,
    lastDate: new Date("2026-07-05T12:00:00.000Z"),
  }
  m.guardCalls = []
  m.writes = []
  m.recurringUpdates = []
  m.launchArgs = []
})

describe("POST /api/transactions/[id]/messages", () => {
  it("dia fechado responde 423, não 500, e não grava", async () => {
    m.closed = true
    await expectLocked(await messagePost(jsonReq("/api/transactions/t1/messages", { content: "oi" }), txRoute))
    expect(m.writes).toEqual([])
  })

  it("sem sessão responde 401", async () => {
    m.ctx = null
    const res = await messagePost(jsonReq("/api/transactions/t1/messages", { content: "oi" }), txRoute)
    expect(res.status).toBe(401)
    expect(m.guardCalls).toEqual([])
  })

  it("dia aberto grava, e a conferência olha o dia da linha dentro da transação", async () => {
    const res = await messagePost(jsonReq("/api/transactions/t1/messages", { content: "oi" }), txRoute)
    expect(res.status).toBe(201)
    expect(m.guardCalls).toHaveLength(1)
    expect(m.guardCalls[0].days).toEqual([ROW_DAY])
    expectGuardInsideTransaction()
  })
})

describe("DELETE /api/transactions/[id]/messages/[messageId]", () => {
  it("dia fechado responde 423, não 500, e não apaga", async () => {
    m.closed = true
    await expectLocked(await messageDelete(deleteReq("/api/transactions/t1/messages/msg1"), messageRoute))
    expect(m.writes).toEqual([])
  })

  it("sem sessão responde 401", async () => {
    m.ctx = null
    const res = await messageDelete(deleteReq("/api/transactions/t1/messages/msg1"), messageRoute)
    expect(res.status).toBe(401)
    expect(m.guardCalls).toEqual([])
  })

  it("dia aberto apaga, com a conferência do dia da linha dentro da transação", async () => {
    const res = await messageDelete(deleteReq("/api/transactions/t1/messages/msg1"), messageRoute)
    expect(res.status).toBe(200)
    expect(m.guardCalls[0].days).toEqual([ROW_DAY])
    expect(m.writes).toEqual(["tx:message.delete"])
    expectGuardInsideTransaction()
  })
})

describe("POST /api/transactions/[id]/attachments", () => {
  it("dia fechado responde 423, não 500, e não grava arquivo nenhum", async () => {
    m.closed = true
    await expectLocked(await attachmentPost(filesReq(["a.png", "b.png"]), txRoute))
    expect(m.writes).toEqual([])
  })

  it("sem sessão responde 401", async () => {
    m.ctx = null
    const res = await attachmentPost(filesReq(["a.png"]), txRoute)
    expect(res.status).toBe(401)
    expect(m.guardCalls).toEqual([])
  })

  it("dia aberto grava os dois arquivos com UMA conferência antes do laço", async () => {
    const res = await attachmentPost(filesReq(["a.png", "b.png"]), txRoute)
    expect(res.status).toBe(201)
    expect(m.guardCalls).toHaveLength(1)
    expect(m.guardCalls[0].days).toEqual([ROW_DAY])
    expect(m.writes).toEqual(["tx:attachment.create", "tx:attachment.create"])
    expectGuardInsideTransaction()
  })
})

describe("DELETE /api/transactions/[id]/attachments/[attachmentId]", () => {
  it("dia fechado responde 423, não 500, e não apaga", async () => {
    m.closed = true
    await expectLocked(await attachmentDelete(deleteReq("/api/transactions/t1/attachments/a1"), attachmentRoute))
    expect(m.writes).toEqual([])
  })

  it("sem sessão responde 401", async () => {
    m.ctx = null
    const res = await attachmentDelete(deleteReq("/api/transactions/t1/attachments/a1"), attachmentRoute)
    expect(res.status).toBe(401)
    expect(m.guardCalls).toEqual([])
  })

  it("dia aberto apaga, com a conferência do dia da linha dentro da transação", async () => {
    const res = await attachmentDelete(deleteReq("/api/transactions/t1/attachments/a1"), attachmentRoute)
    expect(res.status).toBe(200)
    expect(m.guardCalls[0].days).toEqual([ROW_DAY])
    expect(m.writes).toEqual(["tx:attachment.delete"])
    expectGuardInsideTransaction()
  })
})

describe("POST /api/recurring-transactions/[id]/launch", () => {
  it("monta o contexto DESCARTANDO o token de PIN", async () => {
    await launchPost(jsonReq("/api/recurring-transactions/r1/launch"), txRoute)
    expect(m.ctxOpts).toEqual([{ allowOverride: false }])
  })

  it("token de PIN válido em dia fechado ainda responde 423, com canOverride falso", async () => {
    m.ctx = WITH_PIN
    m.closed = true
    const res = await launchPost(jsonReq("/api/recurring-transactions/r1/launch"), txRoute)
    await expectLocked(res, false)
    expect(m.recurringUpdates).toEqual([])
  })

  it("sem data, mantém a regra do lastDate", async () => {
    const res = await launchPost(jsonReq("/api/recurring-transactions/r1/launch"), txRoute)
    expect(res.status).toBe(201)
    expect(m.launchArgs[0].date).toBe("2026-07-05")
    expect(m.recurringUpdates).toEqual([{ lastDate: new Date("2026-07-05T12:00:00.000Z"), period: "202607" }])
  })

  it("com data, lança nela e grava lastDate e período do modelo com a data lançada", async () => {
    const res = await launchPost(jsonReq("/api/recurring-transactions/r1/launch", { date: OTHER_DAY }), txRoute)
    expect(res.status).toBe(201)
    expect(m.launchArgs[0].date).toBe(OTHER_DAY)
    expect(m.launchArgs[0].period).toBe("202609")
    expect(m.recurringUpdates).toEqual([{ lastDate: new Date(`${OTHER_DAY}T12:00:00.000Z`), period: "202609" }])
    expect(await res.json()).toMatchObject({ recurring: { id: "r1", period: "202609" } })
  })

  it("data ilegível responde 400 antes de lançar", async () => {
    const res = await launchPost(jsonReq("/api/recurring-transactions/r1/launch", { date: "10/09/2026" }), txRoute)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("errors.invalidDateFormat")
    expect(m.launchArgs).toEqual([])
  })

  it("sem sessão responde 401", async () => {
    m.ctx = null
    const res = await launchPost(jsonReq("/api/recurring-transactions/r1/launch"), txRoute)
    expect(res.status).toBe(401)
    expect(m.launchArgs).toEqual([])
  })
})
