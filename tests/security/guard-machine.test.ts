import { describe, expect, it, vi } from "vitest"
import {
  createDateClosingInterceptor,
  createGuardMachine,
  createSerialDialogOpener,
  firstOpenDayKey,
  isClosedDay,
  isLaunchRoute,
  laterDayKey,
  planQueuedDialog,
  settledPending,
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

  /**
   * Dois laços que se cruzam: o lote da tabela (cinco ações em lote) e o laço de parcelas do
   * formulário. Salvar um formulário parcelado no meio de um lote longo NÃO pode encerrar o escopo
   * do lote — se encerrasse, as linhas que faltavam voltariam a pedir o PIN uma a uma.
   */
  it("lote aninhado: o fim do de dentro não encerra o de fora", () => {
    const machine = createGuardMachine()
    machine.beginBatch()
    machine.decide("declined")
    expect(machine.onLocked(NOW)).toBe("pass")

    machine.beginBatch()
    // O de dentro nem apaga a decisão de quem o cerca ao abrir...
    expect(machine.onLocked(NOW)).toBe("pass")
    machine.endBatch()
    // ...nem ao fechar.
    expect(machine.onLocked(NOW)).toBe("pass")

    machine.endBatch()
    expect(machine.onLocked(NOW)).toBe("ask")
  })

  it("endBatch a mais não deixa o contador negativo", () => {
    const machine = createGuardMachine()
    machine.endBatch()
    machine.endBatch()
    machine.beginBatch()
    machine.decide("declined")
    expect(machine.onLocked(NOW)).toBe("pass")
    machine.endBatch()
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

  it("423 no meio do lote com token vivo repete com o token, sem abrir janela", async () => {
    // O servidor recusou o token nesta linha (ou ela é de outra competência): a resposta é 423
    // mesmo com o cabeçalho na primeira tentativa. A repetição é o único caminho aqui.
    const machine = createGuardMachine()
    machine.beginBatch()
    machine.setToken("tok-lote", Date.now() + 120_000)
    machine.decide("token")
    const open = vi.fn(async (): Promise<DialogResult> => ({ kind: "changeDate" }))
    const { target, calls } = fakeTarget([lockedResponse, () => new Response("{}", { status: 200 })])
    createInterceptorHost(target).install(
      createDateClosingInterceptor({ machine, open, origin: ORIGIN }),
      20,
    )

    const res = await target.fetch("/api/transactions/1/quick-pay", { method: "POST" })

    expect(open).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
    expect(calls.length).toBe(2)
    expect(new Headers(calls[1][1]?.headers).get(PIN_TOKEN_HEADER)).toBe("tok-lote")
  })

  it("dois 423 em paralelo no mesmo lote abrem UMA janela só", async () => {
    const machine = createGuardMachine()
    machine.beginBatch()
    const show = vi.fn(async (): Promise<DialogResult> => ({ kind: "changeDate" }))
    const opener = createSerialDialogOpener({ machine, show })
    const { target } = fakeTarget([lockedResponse])
    createInterceptorHost(target).install(
      createDateClosingInterceptor({ machine, open: opener.open, origin: ORIGIN }),
      20,
    )

    const [first, second] = await Promise.all([
      target.fetch("/api/transactions", { method: "POST", body: "{}" }),
      target.fetch("/api/transactions/2", { method: "PATCH", body: "{}" }),
    ])

    expect(first.status).toBe(423)
    expect(second.status).toBe(423)
    expect(show).toHaveBeenCalledTimes(1)
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

describe("piso de data da janela", () => {
  it("o primeiro dia aberto é o seguinte ao corte", () => {
    expect(firstOpenDayKey("2026-08-31")).toBe("2026-09-01")
    expect(firstOpenDayKey("2026-02-28")).toBe("2026-03-01")
  })

  it("sem corte legível não existe piso", () => {
    expect(firstOpenDayKey(null)).toBeNull()
    expect(firstOpenDayKey("31/08/2026")).toBeNull()
    expect(firstOpenDayKey("2026-02-31")).toBeNull()
  })

  it("data dentro do período fechado é recusada, a do dia seguinte passa", () => {
    expect(isClosedDay("2026-08-31", "2026-08-31")).toBe(true)
    expect(isClosedDay("2026-01-02", "2026-08-31")).toBe(true)
    expect(isClosedDay("2026-09-01", "2026-08-31")).toBe(false)
    expect(isClosedDay("2026-09-10", "2026-08-31")).toBe(false)
    expect(isClosedDay("2026-08-31", null)).toBe(false)
    expect(isClosedDay("", "2026-08-31")).toBe(false)
  })

  it("entre o corte do 423 e o do provider vale o mais tarde", () => {
    expect(laterDayKey("2026-08-31", "2026-09-30")).toBe("2026-09-30")
    expect(laterDayKey("2026-09-30", "2026-08-31")).toBe("2026-09-30")
    expect(laterDayKey(null, "2026-08-31")).toBe("2026-08-31")
    expect(laterDayKey("2026-08-31", null)).toBe("2026-08-31")
    expect(laterDayKey(null, null)).toBeNull()
  })
})

describe("plano da fila da janela", () => {
  const base = {
    disposed: false,
    mode: "pin",
    heldToken: null,
    tokenIsNewer: false,
    tokenStillValid: false,
    lockedAction: "ask",
  } satisfies Parameters<typeof planQueuedDialog>[0]

  it("desmontado resolve como recusa em vez de abrir janela nenhuma", () => {
    expect(planQueuedDialog({ ...base, disposed: true })).toEqual({
      kind: "resolved",
      result: { kind: "changeDate" },
    })
  })

  it("token que chegou na espera dispensa perguntar de novo", () => {
    expect(
      planQueuedDialog({
        ...base,
        heldToken: { token: "tok", expiresAt: "2026-09-03T12:02:00.000Z" },
        tokenIsNewer: true,
        tokenStillValid: true,
      }),
    ).toEqual({ kind: "resolved", result: { kind: "token", token: "tok", expiresAt: "2026-09-03T12:02:00.000Z" } })
  })

  it("token velho (do lote anterior) não dispensa a pergunta", () => {
    expect(
      planQueuedDialog({
        ...base,
        heldToken: { token: "tok", expiresAt: "2026-09-03T12:02:00.000Z" },
        tokenIsNewer: false,
        tokenStillValid: true,
      }),
    ).toEqual({ kind: "show" })
  })

  it("lote já recusado resolve na hora, sem segunda janela", () => {
    expect(planQueuedDialog({ ...base, lockedAction: "pass" })).toEqual({
      kind: "resolved",
      result: { kind: "changeDate" },
    })
    expect(planQueuedDialog({ ...base, mode: "chooseDate", lockedAction: "pass" })).toEqual({
      kind: "resolved",
      result: { kind: "changeDate" },
    })
  })

  it("criar PIN não é escrita: recusa de lote não bloqueia", () => {
    expect(planQueuedDialog({ ...base, mode: "createPin", lockedAction: "pass" })).toEqual({ kind: "show" })
  })

  it("no caminho normal, abre", () => {
    expect(planQueuedDialog(base)).toEqual({ kind: "show" })
  })
})

describe("fila da janela", () => {
  it("desmontar solta a janela na tela E a que ainda esperava a vez", async () => {
    const machine = createGuardMachine()
    // A primeira janela nunca responde sozinha: é a que fica na tela quando o painel some.
    const show = vi.fn((): Promise<DialogResult> => new Promise<DialogResult>(() => {}))
    const opener = createSerialDialogOpener({ machine, show })
    const request: DialogRequest = {
      days: [],
      periods: [],
      closedThrough: null,
      canOverride: true,
      mode: "pin",
    }

    const dispose = opener.mount()
    const first = opener.open(request)
    const second = opener.open(request)
    await Promise.resolve()

    dispose()

    await expect(first).resolves.toEqual({ kind: "changeDate" })
    await expect(second).resolves.toEqual({ kind: "changeDate" })
    // A segunda nem chegou a virar janela, e depois do desmonte nada mais abre.
    expect(show).toHaveBeenCalledTimes(1)
    await expect(opener.open(request)).resolves.toEqual({ kind: "changeDate" })
    expect(show).toHaveBeenCalledTimes(1)
  })

  it("remontar (modo estrito do React) devolve a fila ao trabalho", async () => {
    const machine = createGuardMachine()
    const show = vi.fn(async (): Promise<DialogResult> => ({ kind: "changeDate" }))
    const opener = createSerialDialogOpener({ machine, show })
    const request: DialogRequest = {
      days: [],
      periods: [],
      closedThrough: null,
      canOverride: true,
      mode: "pin",
    }

    opener.mount()()
    opener.mount()

    await expect(opener.open(request)).resolves.toEqual({ kind: "changeDate" })
    expect(show).toHaveBeenCalledTimes(1)
  })

  it("token obtido na primeira janela serve a segunda sem perguntar", async () => {
    const machine = createGuardMachine()
    const expiresAt = new Date(Date.now() + 120_000).toISOString()
    const opener = createSerialDialogOpener({
      machine,
      show: vi.fn(async (): Promise<DialogResult> => {
        opener.keepToken("tok-1", expiresAt)
        return { kind: "token", token: "tok-1", expiresAt }
      }),
    })
    const request: DialogRequest = {
      days: [],
      periods: [],
      closedThrough: null,
      canOverride: true,
      mode: "pin",
    }

    const [first, second] = await Promise.all([opener.open(request), opener.open(request)])

    expect(first).toEqual({ kind: "token", token: "tok-1", expiresAt })
    expect(second).toEqual({ kind: "token", token: "tok-1", expiresAt })
  })
})

describe("settledPending", () => {
  it("apaga quando o id resolvido ainda é o pendente", () => {
    expect(settledPending({ id: 1 }, 1)).toBeNull()
  })

  it("preserva um pedido NOVO que já tomou o lugar do que estava sendo resolvido", () => {
    // Simula a corrida: o settle da janela 1 foi adiado (setTimeout), e antes dele vencer a
    // fila já trocou `pending` pela janela 2. O settle atrasado não pode apagar a janela 2.
    expect(settledPending({ id: 2 }, 1)).toEqual({ id: 2 })
  })

  it("não faz nada quando já não há pendente nenhum", () => {
    expect(settledPending(null, 1)).toBeNull()
  })
})
