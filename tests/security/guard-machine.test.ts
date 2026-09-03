import { describe, expect, it, vi } from "vitest"
import {
  createDateClosingInterceptor,
  createGuardMachine,
  isLaunchRoute,
  type DialogRequest,
  type DialogResult,
} from "@/features/security/lib/guard-machine"
import { DATE_CLOSED_HEADER, PIN_TOKEN_HEADER } from "@/features/security/lib/http"
import { createInterceptorHost } from "@/lib/fetch-interceptors"

const ORIGIN = "http://localhost:3000"
const NOW = Date.parse("2026-09-03T12:00:00.000Z")
const ALIVE = NOW + 60_000
const DEAD = NOW - 1

const lockedBody = JSON.stringify({
  error: "fechado",
  code: "DATE_CLOSED",
  days: ["2026-08-31"],
  periods: [],
  closedThrough: "2026-08-31",
  canOverride: true,
})

function lockedResponse() {
  return new Response(lockedBody, { status: 423, headers: { [DATE_CLOSED_HEADER]: "1" } })
}

/** Alvo falso: guarda os args de cada chamada e devolve a resposta programada da vez. */
function fakeTarget(responses: Array<() => Response>) {
  const calls: Array<[unknown, RequestInit | undefined]> = []
  let index = 0
  const fetchFn = (async (input: unknown, init?: RequestInit) => {
    calls.push([input, init])
    const make = responses[Math.min(index, responses.length - 1)]
    index += 1
    return make()
  }) as unknown as typeof fetch
  return { target: { fetch: fetchFn }, calls }
}

describe("máquina do guard", () => {
  it("token vivo responde hasValidToken e devolve o valor", () => {
    const machine = createGuardMachine()
    machine.setToken("abc", ALIVE)
    expect(machine.hasValidToken(NOW)).toBe(true)
    expect(machine.tokenValue(NOW)).toBe("abc")
  })

  it("token vencido não vale e não devolve valor", () => {
    const machine = createGuardMachine()
    machine.setToken("abc", DEAD)
    expect(machine.hasValidToken(NOW)).toBe(false)
    expect(machine.tokenValue(NOW)).toBeNull()
  })

  it("sem token nenhum, nada vale", () => {
    const machine = createGuardMachine()
    expect(machine.hasValidToken(NOW)).toBe(false)
    expect(machine.tokenValue(NOW)).toBeNull()
  })

  it("fora de lote, um 423 sempre pergunta, mesmo depois de recusar", () => {
    const machine = createGuardMachine()
    expect(machine.onLocked(NOW)).toBe("ask")
    machine.decide("declined")
    expect(machine.onLocked(NOW)).toBe("ask")
  })

  it("em lote, recusar faz os próximos 423 passarem direto até o fim do lote", () => {
    const machine = createGuardMachine()
    machine.beginBatch()
    expect(machine.onLocked(NOW)).toBe("ask")
    machine.decide("declined")
    expect(machine.onLocked(NOW)).toBe("pass")
    expect(machine.onLocked(NOW)).toBe("pass")
    machine.endBatch()
    expect(machine.onLocked(NOW)).toBe("ask")
  })

  it("em lote, com token vivo, os próximos 423 repetem sem perguntar", () => {
    const machine = createGuardMachine()
    machine.beginBatch()
    machine.setToken("abc", ALIVE)
    machine.decide("token")
    expect(machine.onLocked(NOW)).toBe("retry")
  })

  it("em lote, token vencido no meio volta a perguntar", () => {
    const machine = createGuardMachine()
    machine.beginBatch()
    machine.setToken("abc", ALIVE)
    machine.decide("token")
    expect(machine.onLocked(ALIVE + 1)).toBe("ask")
  })

  it("endBatch limpa a decisão do lote anterior", () => {
    const machine = createGuardMachine()
    machine.beginBatch()
    machine.decide("declined")
    machine.endBatch()
    machine.beginBatch()
    expect(machine.onLocked(NOW)).toBe("ask")
  })

  it("decidir fora de lote não gruda em nada", () => {
    const machine = createGuardMachine()
    machine.decide("token")
    machine.beginBatch()
    expect(machine.onLocked(NOW)).toBe("ask")
  })
})

describe("isLaunchRoute", () => {
  it("reconhece o POST de lançar recorrente", () => {
    expect(isLaunchRoute(["/api/recurring-transactions/abc-123/launch", { method: "POST" }], ORIGIN)).toBe(true)
    expect(isLaunchRoute([`${ORIGIN}/api/recurring-transactions/abc/launch`, { method: "post" }], ORIGIN)).toBe(true)
  })

  it("recusa outras rotas, outros métodos e outra origem", () => {
    expect(isLaunchRoute(["/api/recurring-transactions/abc", { method: "POST" }], ORIGIN)).toBe(false)
    expect(isLaunchRoute(["/api/transactions", { method: "POST" }], ORIGIN)).toBe(false)
    expect(isLaunchRoute(["/api/recurring-transactions/abc/launch", { method: "GET" }], ORIGIN)).toBe(false)
    expect(isLaunchRoute(["/api/recurring-transactions/abc/launch", undefined], ORIGIN)).toBe(false)
    expect(isLaunchRoute(["https://other.test/api/recurring-transactions/abc/launch", { method: "POST" }], ORIGIN)).toBe(false)
    expect(isLaunchRoute([new Request(`${ORIGIN}/api/recurring-transactions/a/launch`, { method: "POST" }), undefined], ORIGIN)).toBe(false)
  })
})

describe("interceptador de data fechada", () => {
  it("com token vivo, o cabeçalho já vai na primeira tentativa", async () => {
    const machine = createGuardMachine()
    machine.setToken("abc", Date.now() + 60_000)
    const open = vi.fn(async (): Promise<DialogResult> => ({ kind: "changeDate" }))
    const { target, calls } = fakeTarget([() => new Response("{}", { status: 200 })])
    createInterceptorHost(target).install(
      createDateClosingInterceptor({ machine, open, origin: ORIGIN }),
      20,
    )

    await target.fetch("/api/transactions", { method: "POST", body: "{}" })

    expect(calls.length).toBe(1)
    expect(new Headers(calls[0][1]?.headers).get(PIN_TOKEN_HEADER)).toBe("abc")
    expect(open).not.toHaveBeenCalled()
  })

  it("não põe cabeçalho em leitura nem em rota de fora de /api", async () => {
    const machine = createGuardMachine()
    machine.setToken("abc", Date.now() + 60_000)
    const open = vi.fn(async (): Promise<DialogResult> => ({ kind: "changeDate" }))
    const { target, calls } = fakeTarget([() => new Response("{}", { status: 200 })])
    createInterceptorHost(target).install(
      createDateClosingInterceptor({ machine, open, origin: ORIGIN }),
      20,
    )

    await target.fetch("/api/transactions")
    expect(new Headers(calls[0][1]?.headers).get(PIN_TOKEN_HEADER)).toBeNull()
  })

  it("em lote já recusado, o 423 volta cru e a janela nem abre", async () => {
    const machine = createGuardMachine()
    machine.beginBatch()
    machine.decide("declined")
    const open = vi.fn(async (): Promise<DialogResult> => ({ kind: "changeDate" }))
    const { target, calls } = fakeTarget([lockedResponse])
    createInterceptorHost(target).install(
      createDateClosingInterceptor({ machine, open, origin: ORIGIN }),
      20,
    )

    const res = await target.fetch("/api/transactions/1/quick-pay", { method: "POST" })

    expect(res.status).toBe(423)
    expect(open).not.toHaveBeenCalled()
    expect(calls.length).toBe(1)
    await expect(res.json()).resolves.toMatchObject({ code: "DATE_CLOSED" })
  })

  it("requisição sem corpo é repetida com o cabeçalho depois do PIN", async () => {
    const machine = createGuardMachine()
    const expiresAt = new Date(Date.now() + 120_000).toISOString()
    const open = vi.fn(async (): Promise<DialogResult> => ({ kind: "token", token: "tok-1", expiresAt }))
    const { target, calls } = fakeTarget([lockedResponse, () => new Response("{}", { status: 200 })])
    createInterceptorHost(target).install(
      createDateClosingInterceptor({ machine, open, origin: ORIGIN }),
      20,
    )

    const res = await target.fetch("/api/transactions/1/quick-pay", { method: "POST" })

    expect(res.status).toBe(200)
    expect(calls.length).toBe(2)
    expect(calls[1][1]?.method).toBe("POST")
    expect(new Headers(calls[1][1]?.headers).get(PIN_TOKEN_HEADER)).toBe("tok-1")
    expect(machine.hasValidToken(Date.now())).toBe(true)
  })

  it("a janela recebe os dados do corpo do 423 e o modo pin", async () => {
    const machine = createGuardMachine()
    const seen: DialogRequest[] = []
    const open = vi.fn(async (request: DialogRequest): Promise<DialogResult> => {
      seen.push(request)
      return { kind: "changeDate" }
    })
    const { target } = fakeTarget([lockedResponse])
    createInterceptorHost(target).install(
      createDateClosingInterceptor({ machine, open, origin: ORIGIN }),
      20,
    )

    const res = await target.fetch("/api/transactions", { method: "POST", body: "{}" })

    expect(res.status).toBe(423)
    expect(seen[0]).toEqual({
      days: ["2026-08-31"],
      periods: [],
      closedThrough: "2026-08-31",
      canOverride: true,
      mode: "pin",
    })
  })

  it("recusar dentro do lote marca o lote e devolve a resposta original", async () => {
    const machine = createGuardMachine()
    machine.beginBatch()
    const open = vi.fn(async (): Promise<DialogResult> => ({ kind: "changeDate" }))
    const { target } = fakeTarget([lockedResponse])
    createInterceptorHost(target).install(
      createDateClosingInterceptor({ machine, open, origin: ORIGIN }),
      20,
    )

    const res = await target.fetch("/api/transactions", { method: "POST", body: "{}" })

    expect(res.status).toBe(423)
    expect(open).toHaveBeenCalledTimes(1)
    expect(machine.onLocked(Date.now())).toBe("pass")
  })

  it("lançar recorrente abre em modo chooseDate e repete com a data escolhida", async () => {
    const machine = createGuardMachine()
    const seen: DialogRequest[] = []
    const open = vi.fn(async (request: DialogRequest): Promise<DialogResult> => {
      seen.push(request)
      return { kind: "chooseDate", date: "2026-09-10" }
    })
    const { target, calls } = fakeTarget([lockedResponse, () => new Response("{}", { status: 200 })])
    createInterceptorHost(target).install(
      createDateClosingInterceptor({ machine, open, origin: ORIGIN }),
      20,
    )

    const res = await target.fetch("/api/recurring-transactions/r1/launch", { method: "POST" })

    expect(res.status).toBe(200)
    expect(seen[0]?.mode).toBe("chooseDate")
    expect(calls.length).toBe(2)
    expect(calls[1][1]?.body).toBe(JSON.stringify({ date: "2026-09-10" }))
    expect(new Headers(calls[1][1]?.headers).get("content-type")).toBe("application/json")
  })

  it("resposta que não é 423, ou sem o cabeçalho, passa intacta", async () => {
    const machine = createGuardMachine()
    const open = vi.fn(async (): Promise<DialogResult> => ({ kind: "changeDate" }))
    const { target } = fakeTarget([() => new Response(lockedBody, { status: 423 })])
    createInterceptorHost(target).install(
      createDateClosingInterceptor({ machine, open, origin: ORIGIN }),
      20,
    )

    const res = await target.fetch("/api/transactions", { method: "POST", body: "{}" })

    expect(res.status).toBe(423)
    expect(open).not.toHaveBeenCalled()
  })
})
