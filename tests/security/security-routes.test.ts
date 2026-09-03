import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

/**
 * Contrato das SEIS rotas /api/security/* (desenho, seção 8): estado, fechar, prévia de
 * reabertura, reabrir, definir PIN e conferir PIN. Cada status do contrato tem o seu `it`, e
 * cada um afirma o código EXATO do fio. Serviços, contexto de escrita e Prisma são dublados:
 * nenhum banco é tocado.
 */
const m = vi.hoisted(() => ({
  ctx: null as unknown,
  /** Opções com que cada rota montou o contexto: só `reopen` pode aceitar o token de PIN. */
  ctxOpts: [] as unknown[],
  state: vi.fn(),
  close: vi.fn(),
  reopen: vi.fn(),
  preview: vi.fn(),
  setPin: vi.fn(),
  verifyPin: vi.fn(),
  issue: vi.fn(),
}))

vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }))
vi.mock("@/lib/prisma", () => ({ prisma: { __client: "global" } }))
vi.mock("@/features/security/services/write-context", () => ({
  getWriteContext: async (_request: Request, opts?: unknown) => {
    m.ctxOpts.push(opts)
    return m.ctx
  },
}))
vi.mock("@/features/security/services/date-closing.service", () => ({
  getDateClosingState: m.state,
  closeThrough: m.close,
  reopenFrom: m.reopen,
  countProtected: m.preview,
}))
vi.mock("@/features/security/services/pin.service", () => ({
  setPin: m.setPin,
  verifyPin: m.verifyPin,
  issueOverrideToken: m.issue,
}))

import { prisma } from "@/lib/prisma"
import { SecurityError } from "@/features/security/lib/http"
import type { WriteContext } from "@/features/security/services/write-context"
import { GET as stateRoute } from "@/app/api/security/date-closing/route"
import { POST as closeRoute } from "@/app/api/security/date-closing/close/route"
import { GET as previewRoute } from "@/app/api/security/date-closing/reopen-preview/route"
import { POST as reopenRoute } from "@/app/api/security/date-closing/reopen/route"
import { PUT as pinRoute } from "@/app/api/security/pin/route"
import { POST as verifyRoute } from "@/app/api/security/pin/verify/route"

const OPEN = { showcase: false, override: null }
/** Dono da instalação: fecha, reabre e mexe no PIN. */
const OWNER: WriteContext = { actorUserId: "dono", ownerId: "dono", role: "SUPERADMIN", status: "ACTIVE", ...OPEN }
/** Convidado ADMIN: fecha e reabre, mas o PIN é do dono. */
const ADMIN: WriteContext = { actorUserId: "admin", ownerId: "dono", role: "ADMIN", status: "ACTIVE", ...OPEN }
/** Convidado comum: não fecha, não reabre, não mexe no PIN. */
const GUEST: WriteContext = { actorUserId: "convidado", ownerId: "dono", role: "USER", status: "ACTIVE", ...OPEN }
/** Vitrine da demo: nem o dono manda. */
const SHOWCASE: WriteContext = { ...OWNER, showcase: true }

const STATE = {
  closedThrough: "2026-08-31",
  hasPin: true,
  canManageClosing: true,
  canManagePin: true,
  showcase: false,
}

function req(path: string, method: "GET" | "POST" | "PUT", body?: unknown) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function expectCode(res: Response, status: number, code: string) {
  expect(res.status).toBe(status)
  const json = await res.json()
  expect(json.code).toBe(code)
  return json as Record<string, unknown>
}

/** Sem sessão o corpo não traz código nenhum: nada a interpretar, só entre de novo. */
async function expectNoSession(res: Response) {
  expect(res.status).toBe(401)
  expect((await res.json()).code).toBeUndefined()
}

beforeEach(() => {
  m.ctx = OWNER
  m.ctxOpts = []
  for (const fn of [m.state, m.close, m.reopen, m.preview, m.setPin, m.verifyPin, m.issue]) fn.mockReset()
  m.state.mockResolvedValue(STATE)
  m.close.mockResolvedValue({ closedThrough: "2026-09-01", changed: true })
  m.reopen.mockResolvedValue({ closedThrough: "2026-07-31", changed: true })
  m.preview.mockResolvedValue({ count: 12, closedThrough: "2026-08-31" })
  m.setPin.mockResolvedValue(undefined)
  m.verifyPin.mockResolvedValue({ ok: true })
  m.issue.mockResolvedValue({ token: "tok-de-2-minutos", expiresAt: "2026-09-03T12:02:00.000Z" })
})

describe("GET /api/security/date-closing", () => {
  it("200 devolve o estado com os CINCO campos do contrato e nada mais", async () => {
    const res = await stateRoute(req("/api/security/date-closing", "GET"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual(STATE)
    expect(Object.keys(body).sort()).toEqual([
      "canManageClosing",
      "canManagePin",
      "closedThrough",
      "hasPin",
      "showcase",
    ])
    expect(m.state).toHaveBeenCalledWith(OWNER)
  })

  it("sessão de vitrine recebe o estado sem poder nenhum", async () => {
    m.ctx = SHOWCASE
    m.state.mockResolvedValue({ ...STATE, canManageClosing: false, canManagePin: false, showcase: true })
    const body = await (await stateRoute(req("/api/security/date-closing", "GET"))).json()
    expect(body).toMatchObject({ canManageClosing: false, canManagePin: false, showcase: true })
  })

  it("sem sessão responde 401 e não lê nada", async () => {
    m.ctx = null
    await expectNoSession(await stateRoute(req("/api/security/date-closing", "GET")))
    expect(m.state).not.toHaveBeenCalled()
  })

  it("nunca aceita o token de PIN: o estado é leitura", async () => {
    await stateRoute(req("/api/security/date-closing", "GET"))
    expect(m.ctxOpts).toEqual([{ allowOverride: false }])
  })

  it("falha do serviço vira 500, não estouro", async () => {
    m.state.mockRejectedValue(new Error("banco fora"))
    const res = await stateRoute(req("/api/security/date-closing", "GET"))
    expect(res.status).toBe(500)
    expect((await res.json()).code).toBeUndefined()
  })
})

describe("POST /api/security/date-closing/close", () => {
  const call = (body?: unknown) => closeRoute(req("/api/security/date-closing/close", "POST", body))
  const FULL = { through: "2026-09-01", today: "2026-09-02" }

  it("200 fecha e devolve o corte novo", async () => {
    const res = await call(FULL)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ closedThrough: "2026-09-01", changed: true })
    expect(m.close).toHaveBeenCalledWith(OWNER, FULL)
    expect(m.ctxOpts).toEqual([{ allowOverride: false }])
  })

  it("convidado ADMIN também fecha", async () => {
    m.ctx = ADMIN
    expect((await call(FULL)).status).toBe(200)
  })

  it("403 FORBIDDEN para USER convidado, antes de qualquer leitura", async () => {
    m.ctx = GUEST
    await expectCode(await call(FULL), 403, "FORBIDDEN")
    expect(m.close).not.toHaveBeenCalled()
  })

  it("403 FORBIDDEN na vitrine", async () => {
    m.ctx = SHOWCASE
    await expectCode(await call(FULL), 403, "FORBIDDEN")
    expect(m.close).not.toHaveBeenCalled()
  })

  it("400 INVALID_TODAY quando a data não serve", async () => {
    m.close.mockRejectedValue(new SecurityError("invalidToday", 400))
    await expectCode(await call({ ...FULL, through: "01/09/2026" }), 400, "INVALID_TODAY")
  })

  it("corpo vazio não quebra a rota: chega ao serviço como texto vazio", async () => {
    m.close.mockRejectedValue(new SecurityError("invalidToday", 400))
    await expectCode(await call(), 400, "INVALID_TODAY")
    expect(m.close).toHaveBeenCalledWith(OWNER, { through: "", today: "" })
  })

  it("409 UNPAID_BLOCKERS devolve a lista de bloqueadores", async () => {
    m.close.mockRejectedValue(
      new SecurityError("unpaidBlockers", 409, {
        count: 3,
        firstDate: "2026-08-02",
        lastDate: "2026-08-30",
        sample: [{ id: "t1", date: "2026-08-02", description: "aluguel", amount: -100, status: "Pending" }],
      }),
    )
    const body = await expectCode(await call(FULL), 409, "UNPAID_BLOCKERS")
    expect(body).toMatchObject({ count: 3, firstDate: "2026-08-02", lastDate: "2026-08-30" })
    expect((body.sample as unknown[]).length).toBe(1)
  })

  it("409 CLOSE_WOULD_REOPEN quando a data anda para trás", async () => {
    m.close.mockRejectedValue(new SecurityError("closeWouldReopen", 409))
    await expectCode(await call(FULL), 409, "CLOSE_WOULD_REOPEN")
  })

  it("428 PIN_NOT_SET quando ainda não há PIN", async () => {
    m.close.mockRejectedValue(new SecurityError("pinNotSet", 428))
    await expectCode(await call(FULL), 428, "PIN_NOT_SET")
  })

  it("sem sessão responde 401 e não chama o serviço", async () => {
    m.ctx = null
    await expectNoSession(await call(FULL))
    expect(m.close).not.toHaveBeenCalled()
  })

  it("erro desconhecido vira 500", async () => {
    m.close.mockRejectedValue(new Error("banco fora"))
    expect((await call(FULL)).status).toBe(500)
  })
})

describe("GET /api/security/date-closing/reopen-preview", () => {
  const call = (query: string) =>
    previewRoute(req(`/api/security/date-closing/reopen-preview${query}`, "GET"))

  it("200 devolve a contagem e o corte", async () => {
    const res = await call("?from=2026-08-01")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ count: 12, closedThrough: "2026-08-31" })
    expect(m.preview).toHaveBeenCalledWith(OWNER, "2026-08-01")
    expect(m.ctxOpts).toEqual([{ allowOverride: false }])
  })

  it("403 FORBIDDEN para USER convidado, antes de contar", async () => {
    m.ctx = GUEST
    await expectCode(await call("?from=2026-08-01"), 403, "FORBIDDEN")
    expect(m.preview).not.toHaveBeenCalled()
  })

  it("403 FORBIDDEN na vitrine: a cerca da demo é por método e não pega GET", async () => {
    m.ctx = SHOWCASE
    await expectCode(await call("?from=2026-08-01"), 403, "FORBIDDEN")
    expect(m.preview).not.toHaveBeenCalled()
  })

  it("400 INVALID_TODAY sem o parâmetro from", async () => {
    m.preview.mockRejectedValue(new SecurityError("invalidToday", 400))
    await expectCode(await call(""), 400, "INVALID_TODAY")
    expect(m.preview).toHaveBeenCalledWith(OWNER, "")
  })

  it("sem sessão responde 401", async () => {
    m.ctx = null
    await expectNoSession(await call("?from=2026-08-01"))
    expect(m.preview).not.toHaveBeenCalled()
  })
})

describe("POST /api/security/date-closing/reopen", () => {
  const call = (body?: unknown) => reopenRoute(req("/api/security/date-closing/reopen", "POST", body))

  it("200 reabre e devolve o corte novo", async () => {
    const res = await call({ from: "2026-08-01" })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ closedThrough: "2026-07-31", changed: true })
    expect(m.reopen).toHaveBeenCalledWith(OWNER, "2026-08-01")
  })

  it("convidado ADMIN também reabre", async () => {
    m.ctx = ADMIN
    expect((await call({ from: "2026-08-01" })).status).toBe(200)
    expect(m.reopen).toHaveBeenCalledWith(ADMIN, "2026-08-01")
  })

  it("é a ÚNICA rota que aceita o token de PIN", async () => {
    await call({ from: "2026-08-01" })
    expect(m.ctxOpts).toEqual([undefined])
  })

  it("401 PIN_REQUIRED sem token válido", async () => {
    m.reopen.mockRejectedValue(new SecurityError("pinRequired", 401))
    await expectCode(await call({ from: "2026-08-01" }), 401, "PIN_REQUIRED")
  })

  it("403 FORBIDDEN para USER convidado, antes de qualquer leitura", async () => {
    m.ctx = GUEST
    await expectCode(await call({ from: "2026-08-01" }), 403, "FORBIDDEN")
    expect(m.reopen).not.toHaveBeenCalled()
  })

  it("403 FORBIDDEN na vitrine", async () => {
    m.ctx = SHOWCASE
    await expectCode(await call({ from: "2026-08-01" }), 403, "FORBIDDEN")
    expect(m.reopen).not.toHaveBeenCalled()
  })

  it("409 NOTHING_TO_REOPEN quando não há nada fechado a partir dali", async () => {
    m.reopen.mockRejectedValue(new SecurityError("nothingToReopen", 409))
    await expectCode(await call({ from: "2026-08-01" }), 409, "NOTHING_TO_REOPEN")
  })

  it("400 INVALID_TODAY com data ilegível", async () => {
    m.reopen.mockRejectedValue(new SecurityError("invalidToday", 400))
    await expectCode(await call({ from: "01/08/2026" }), 400, "INVALID_TODAY")
  })

  it("corpo vazio não quebra a rota", async () => {
    m.reopen.mockRejectedValue(new SecurityError("invalidToday", 400))
    await expectCode(await call(), 400, "INVALID_TODAY")
    expect(m.reopen).toHaveBeenCalledWith(OWNER, "")
  })

  it("sem sessão responde 401 sem código", async () => {
    m.ctx = null
    await expectNoSession(await call({ from: "2026-08-01" }))
    expect(m.reopen).not.toHaveBeenCalled()
  })
})

describe("PUT /api/security/pin", () => {
  const call = (body?: unknown) => pinRoute(req("/api/security/pin", "PUT", body))

  it("200 grava o PIN do dono com o cliente global", async () => {
    const res = await call({ pin: "1234", confirm: "1234" })
    expect(res.status).toBe(200)
    expect(m.setPin).toHaveBeenCalledWith(prisma, "dono", "1234")
    expect(m.ctxOpts).toEqual([{ allowOverride: false }])
  })

  it("400 PIN_MISMATCH quando a confirmação não bate, sem gravar", async () => {
    await expectCode(await call({ pin: "1234", confirm: "4321" }), 400, "PIN_MISMATCH")
    expect(m.setPin).not.toHaveBeenCalled()
  })

  it("400 PIN_INVALID quando não são quatro dígitos", async () => {
    m.setPin.mockRejectedValue(new SecurityError("pinInvalid", 400))
    await expectCode(await call({ pin: "12", confirm: "12" }), 400, "PIN_INVALID")
  })

  it("corpo vazio não quebra a rota", async () => {
    m.setPin.mockRejectedValue(new SecurityError("pinInvalid", 400))
    await expectCode(await call(), 400, "PIN_INVALID")
    expect(m.setPin).toHaveBeenCalledWith(prisma, "dono", "")
  })

  it("403 FORBIDDEN para o convidado ADMIN: o PIN é do dono", async () => {
    m.ctx = ADMIN
    await expectCode(await call({ pin: "1234", confirm: "1234" }), 403, "FORBIDDEN")
    expect(m.setPin).not.toHaveBeenCalled()
  })

  it("403 FORBIDDEN para USER convidado", async () => {
    m.ctx = GUEST
    await expectCode(await call({ pin: "1234", confirm: "1234" }), 403, "FORBIDDEN")
    expect(m.setPin).not.toHaveBeenCalled()
  })

  it("403 FORBIDDEN na vitrine", async () => {
    m.ctx = SHOWCASE
    await expectCode(await call({ pin: "1234", confirm: "1234" }), 403, "FORBIDDEN")
    expect(m.setPin).not.toHaveBeenCalled()
  })

  it("sem sessão responde 401", async () => {
    m.ctx = null
    await expectNoSession(await call({ pin: "1234", confirm: "1234" }))
    expect(m.setPin).not.toHaveBeenCalled()
  })

  it("erro desconhecido vira 500", async () => {
    m.setPin.mockRejectedValue(new Error("banco fora"))
    expect((await call({ pin: "1234", confirm: "1234" })).status).toBe(500)
  })
})

describe("POST /api/security/pin/verify", () => {
  const call = (body?: unknown) => verifyRoute(req("/api/security/pin/verify", "POST", body))

  it("200 devolve só o token e o vencimento", async () => {
    const res = await call({ pin: "1234" })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ token: "tok-de-2-minutos", expiresAt: "2026-09-03T12:02:00.000Z" })
    expect(JSON.stringify(body)).not.toContain("1234")
    expect(m.ctxOpts).toEqual([{ allowOverride: false }])
  })

  it("o token é de quem digitou o PIN, não do dono sozinho", async () => {
    m.ctx = ADMIN
    await call({ pin: "1234" })
    expect(m.issue).toHaveBeenCalledWith({ ownerId: "dono", userId: "admin" })
  })

  it("NUNCA passa horário vindo do corpo para verifyPin", async () => {
    await call({ pin: "1234", now: "2099-01-01T00:00:00.000Z" })
    expect(m.verifyPin).toHaveBeenCalledWith("dono", "1234")
    expect(m.verifyPin.mock.calls[0]).toHaveLength(2)
  })

  it("401 PIN_INVALID diz quantas tentativas restam", async () => {
    m.verifyPin.mockResolvedValue({ ok: false, reason: "invalid", attemptsLeft: 3 })
    const body = await expectCode(await call({ pin: "9999" }), 401, "PIN_INVALID")
    expect(body.attemptsLeft).toBe(3)
    expect(m.issue).not.toHaveBeenCalled()
  })

  it("429 PIN_LOCKED diz até quando", async () => {
    m.verifyPin.mockResolvedValue({ ok: false, reason: "locked", lockedUntil: "2026-09-03T12:15:00.000Z" })
    const body = await expectCode(await call({ pin: "9999" }), 429, "PIN_LOCKED")
    expect(body.lockedUntil).toBe("2026-09-03T12:15:00.000Z")
    expect(m.issue).not.toHaveBeenCalled()
  })

  it("428 PIN_NOT_SET quando não há PIN", async () => {
    m.verifyPin.mockResolvedValue({ ok: false, reason: "pinNotSet" })
    await expectCode(await call({ pin: "1234" }), 428, "PIN_NOT_SET")
    expect(m.issue).not.toHaveBeenCalled()
  })

  it("403 FORBIDDEN para USER convidado, sem sequer conferir o PIN", async () => {
    m.ctx = GUEST
    await expectCode(await call({ pin: "1234" }), 403, "FORBIDDEN")
    expect(m.verifyPin).not.toHaveBeenCalled()
  })

  it("403 FORBIDDEN na vitrine", async () => {
    m.ctx = SHOWCASE
    await expectCode(await call({ pin: "1234" }), 403, "FORBIDDEN")
    expect(m.verifyPin).not.toHaveBeenCalled()
  })

  it("corpo vazio não quebra a rota", async () => {
    m.verifyPin.mockResolvedValue({ ok: false, reason: "invalid", attemptsLeft: 4 })
    await expectCode(await call(), 401, "PIN_INVALID")
    expect(m.verifyPin).toHaveBeenCalledWith("dono", "")
  })

  it("sem sessão responde 401 sem código", async () => {
    m.ctx = null
    await expectNoSession(await call({ pin: "1234" }))
    expect(m.verifyPin).not.toHaveBeenCalled()
  })

  it("erro desconhecido vira 500", async () => {
    m.verifyPin.mockRejectedValue(new Error("banco fora"))
    expect((await call({ pin: "1234" })).status).toBe(500)
  })
})
