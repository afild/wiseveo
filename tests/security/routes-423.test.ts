import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

/**
 * Contrato 423 das SETE rotas de lançamento: dia fechado responde 423 com cabeçalho e código
 * legível por máquina, nunca 500. Sem sessão, 401. Data e competência ilegíveis param na porta
 * com 400, antes do serviço. Serviços e contexto de escrita são dublados: nenhum banco é tocado.
 */
const m = vi.hoisted(() => {
  const service = () => vi.fn(async (...args: unknown[]): Promise<unknown> => args)
  return {
    ctx: null as unknown,
    create: service(),
    update: service(),
    updateDate: service(),
    updatePeriod: service(),
    copy: service(),
    quickPay: service(),
    exclude: service(),
  }
})

vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }))
vi.mock("@/features/security/services/write-context", () => ({ getWriteContext: async () => m.ctx }))
vi.mock("@/features/transactions/services/create-transaction", () => ({ createTransaction: m.create }))
vi.mock("@/features/transactions/services/update-transaction", () => ({ updateTransaction: m.update }))
vi.mock("@/features/transactions/services/update-transaction-date", () => ({ updateTransactionDate: m.updateDate }))
vi.mock("@/features/transactions/services/update-transaction-period", () => ({ updateTransactionPeriod: m.updatePeriod }))
vi.mock("@/features/transactions/services/copy-transaction", () => ({ copyTransaction: m.copy }))
vi.mock("@/features/transactions/services/quick-pay-transaction", () => ({ quickPayTransaction: m.quickPay }))
vi.mock("@/features/transactions/services/exclude-transaction", () => ({ excludeTransaction: m.exclude }))

import { DATE_CLOSED_HEADER, DateClosedError } from "@/features/security/lib/http"
import type { WriteContext } from "@/features/security/services/write-context"
import { POST as createRoute } from "@/app/api/transactions/route"
import { PATCH as updateRoute } from "@/app/api/transactions/[id]/route"
import { PATCH as dateRoute } from "@/app/api/transactions/[id]/date/route"
import { PATCH as periodRoute } from "@/app/api/transactions/[id]/period/route"
import { POST as copyRoute } from "@/app/api/transactions/[id]/copy/route"
import { POST as quickPayRoute } from "@/app/api/transactions/[id]/quick-pay/route"
import { POST as excludeRoute } from "@/app/api/transactions/[id]/exclude/route"

const OWNER: WriteContext = {
  actorUserId: "dono",
  ownerId: "dono",
  role: "SUPERADMIN",
  status: "ACTIVE",
  showcase: false,
  override: null,
}

const CLOSED_DAY = "2026-08-31"
const TARGET_DAY = "2026-09-10"
const closed = () => new DateClosedError([CLOSED_DAY], [], CLOSED_DAY, true)

const FULL_BODY = {
  date: TARGET_DAY,
  amount: 10,
  type: "EXPENSE",
  accountId: 1,
  groupCode: 3,
  categoryCode: "3.1",
  statusCode: 2,
}

function req(path: string, method: "POST" | "PATCH", body?: Record<string, unknown>) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}
const route = { params: Promise.resolve({ id: "t1" }) }

/** O contrato do fio, inteiro: status, cabeçalho e corpo legível por máquina. */
async function expectLocked(res: Response) {
  expect(res.status).toBe(423)
  expect(res.headers.get(DATE_CLOSED_HEADER)).toBe("1")
  const json = await res.json()
  expect(json).toMatchObject({
    code: "DATE_CLOSED",
    days: [CLOSED_DAY],
    periods: [],
    closedThrough: CLOSED_DAY,
    canOverride: true,
  })
}

async function expectStatus(res: Response, status: number, error?: string) {
  expect(res.status).toBe(status)
  if (error !== undefined) expect((await res.json()).error).toBe(error)
}

beforeEach(() => {
  m.ctx = OWNER
  for (const fn of [m.create, m.update, m.updateDate, m.updatePeriod, m.copy, m.quickPay, m.exclude]) {
    fn.mockReset()
    fn.mockImplementation(async () => {
      throw closed()
    })
  }
})

describe("POST /api/transactions", () => {
  it("dia fechado responde 423, não 500", async () => {
    await expectLocked(await createRoute(req("/api/transactions", "POST", FULL_BODY)))
  })

  it("sem sessão responde 401", async () => {
    m.ctx = null
    await expectStatus(await createRoute(req("/api/transactions", "POST", FULL_BODY)), 401)
    expect(m.create).not.toHaveBeenCalled()
  })

  it("data ilegível responde 400 antes do serviço", async () => {
    const res = await createRoute(req("/api/transactions", "POST", { ...FULL_BODY, date: "31/08/2026" }))
    await expectStatus(res, 400, "errors.invalidDateFormat")
    expect(m.create).not.toHaveBeenCalled()
  })

  it("competência fora de YYYYMM responde 400 antes do serviço", async () => {
    const res = await createRoute(req("/api/transactions", "POST", { ...FULL_BODY, period: "2026-08" }))
    await expectStatus(res, 400, "errors.invalidPeriod")
    expect(m.create).not.toHaveBeenCalled()
  })
})

describe("PATCH /api/transactions/[id]", () => {
  it("dia fechado responde 423, não 500", async () => {
    await expectLocked(await updateRoute(req("/api/transactions/t1", "PATCH", FULL_BODY), route))
  })

  it("sem sessão responde 401", async () => {
    m.ctx = null
    await expectStatus(await updateRoute(req("/api/transactions/t1", "PATCH", FULL_BODY), route), 401)
    expect(m.update).not.toHaveBeenCalled()
  })

  it("data ilegível responde 400 antes do serviço", async () => {
    const res = await updateRoute(req("/api/transactions/t1", "PATCH", { ...FULL_BODY, date: "ontem" }), route)
    await expectStatus(res, 400, "errors.invalidDateFormat")
    expect(m.update).not.toHaveBeenCalled()
  })

  it("competência fora de YYYYMM responde 400 antes do serviço", async () => {
    const res = await updateRoute(req("/api/transactions/t1", "PATCH", { ...FULL_BODY, period: "2026-08" }), route)
    await expectStatus(res, 400, "errors.invalidPeriod")
    expect(m.update).not.toHaveBeenCalled()
  })
})

describe("PATCH /api/transactions/[id]/date", () => {
  it("dia fechado responde 423, não 500", async () => {
    await expectLocked(await dateRoute(req("/api/transactions/t1/date", "PATCH", { date: TARGET_DAY }), route))
  })

  it("sem sessão responde 401", async () => {
    m.ctx = null
    await expectStatus(await dateRoute(req("/api/transactions/t1/date", "PATCH", { date: TARGET_DAY }), route), 401)
    expect(m.updateDate).not.toHaveBeenCalled()
  })

  it("data ilegível responde 400 antes do serviço", async () => {
    const res = await dateRoute(req("/api/transactions/t1/date", "PATCH", { date: "202609" }), route)
    await expectStatus(res, 400, "errors.invalidDateFormat")
    expect(m.updateDate).not.toHaveBeenCalled()
  })
})

describe("PATCH /api/transactions/[id]/period", () => {
  it("dia fechado responde 423, não 500", async () => {
    await expectLocked(await periodRoute(req("/api/transactions/t1/period", "PATCH", { period: "202609" }), route))
  })

  it("sem sessão responde 401", async () => {
    m.ctx = null
    await expectStatus(await periodRoute(req("/api/transactions/t1/period", "PATCH", { period: "202609" }), route), 401)
    expect(m.updatePeriod).not.toHaveBeenCalled()
  })

  it("competência fora de YYYYMM responde 400 antes do serviço", async () => {
    const res = await periodRoute(req("/api/transactions/t1/period", "PATCH", { period: "2026-09" }), route)
    await expectStatus(res, 400, "errors.invalidPeriod")
    expect(m.updatePeriod).not.toHaveBeenCalled()
  })
})

describe("POST /api/transactions/[id]/copy", () => {
  it("dia fechado responde 423, e não 500 com a mensagem crua", async () => {
    const res = await copyRoute(req("/api/transactions/t1/copy", "POST", { date: TARGET_DAY }), route)
    await expectLocked(res)
  })

  it("sem sessão responde 401", async () => {
    m.ctx = null
    await expectStatus(await copyRoute(req("/api/transactions/t1/copy", "POST", { date: TARGET_DAY }), route), 401)
    expect(m.copy).not.toHaveBeenCalled()
  })

  it("data ilegível responde 400 antes do serviço", async () => {
    const res = await copyRoute(req("/api/transactions/t1/copy", "POST", { date: "10/09/2026" }), route)
    await expectStatus(res, 400, "errors.invalidDateFormat")
    expect(m.copy).not.toHaveBeenCalled()
  })

  /** Data e dono são os dois `string`: trocá-los compila em silêncio, e só a posição denuncia. */
  it("passa id, DATA e DONO nessa ordem para o serviço", async () => {
    m.copy.mockImplementation(async () => ({ id: "novo" }))
    const res = await copyRoute(req("/api/transactions/t1/copy", "POST", { date: TARGET_DAY }), route)
    expect(res.status).toBe(200)
    expect(m.copy).toHaveBeenCalledTimes(1)
    const args = m.copy.mock.calls[0]
    expect(args[0]).toBe("t1")
    expect(args[1]).toBe(TARGET_DAY)
    expect(args[2]).toBe(OWNER.ownerId)
    expect(args[3]).toBe(OWNER)
  })
})

describe("POST /api/transactions/[id]/quick-pay", () => {
  it("dia fechado responde 423, não 500", async () => {
    await expectLocked(await quickPayRoute(req("/api/transactions/t1/quick-pay", "POST"), route))
  })

  it("sem sessão responde 401", async () => {
    m.ctx = null
    await expectStatus(await quickPayRoute(req("/api/transactions/t1/quick-pay", "POST"), route), 401)
    expect(m.quickPay).not.toHaveBeenCalled()
  })
})

describe("POST /api/transactions/[id]/exclude", () => {
  it("dia fechado responde 423, não 500", async () => {
    await expectLocked(await excludeRoute(req("/api/transactions/t1/exclude", "POST"), route))
  })

  it("sem sessão responde 401", async () => {
    m.ctx = null
    await expectStatus(await excludeRoute(req("/api/transactions/t1/exclude", "POST"), route), 401)
    expect(m.exclude).not.toHaveBeenCalled()
  })
})
