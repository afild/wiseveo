import { describe, expect, it } from "vitest"
import { createInterceptorHost, isEligibleWrite, withHeader } from "@/lib/fetch-interceptors"

function fakeFetch(status = 200) {
  const calls: Array<[unknown, RequestInit | undefined]> = []
  const fetchFn = (async (input: unknown, init?: RequestInit) => { calls.push([input, init]); return new Response("{}", { status }) }) as unknown as typeof fetch
  return { fetchFn, calls }
}

describe("host de interceptadores", () => {
  it("embrulha uma vez, encadeia por ordem e remover um handler não desarma o outro", async () => {
    const { fetchFn, calls } = fakeFetch(423)
    const target = { fetch: fetchFn }
    const host = createInterceptorHost(target)
    const seen: string[] = []
    const off1 = host.install({ after: async () => { seen.push("a"); return null } }, 10)
    host.install({ after: async () => { seen.push("b"); return null } }, 20)
    await target.fetch("/api/x", { method: "POST" })
    expect(seen).toEqual(["a", "b"])
    off1()
    await target.fetch("/api/x", { method: "POST" })
    expect(seen).toEqual(["a", "b", "b"])
    expect(calls.length).toBe(2)
  })
  it("remover um handler dentro do próprio after não pula o handler seguinte", async () => {
    // A janela do PIN segura o `after` por minutos; se o componente desmontar nesse meio-tempo o
    // cleanup tira o handler da lista. Iterando a lista viva o splice desloca os índices e o
    // vizinho de baixo some da rodada.
    const target = { fetch: fakeFetch(423).fetchFn }
    const host = createInterceptorHost(target)
    const seen: string[] = []
    let offA: (() => void) | null = null
    offA = host.install({ after: async () => { seen.push("a"); await Promise.resolve(); offA?.(); return null } }, 10)
    host.install({ after: async () => { seen.push("b"); return null } }, 20)
    host.install({ after: async () => { seen.push("c"); return null } }, 30)
    await target.fetch("/api/x", { method: "POST" })
    expect(seen).toEqual(["a", "b", "c"])
  })
  it("o chamador ainda lê o corpo depois de um handler inspecionar com clone", async () => {
    // Contrato de FetchInterceptor.after: inspecionar SÓ por res.clone(), porque o corpo é lido
    // uma vez só e quem chamou o fetch ainda precisa dele.
    const target = { fetch: fakeFetch(423).fetchFn }
    const host = createInterceptorHost(target)
    const inspecionado: unknown[] = []
    host.install({ after: async (res) => { inspecionado.push(await res.clone().json()); return null } }, 10)
    const res = await target.fetch("/api/x", { method: "POST" })
    expect(inspecionado).toEqual([{}])
    await expect(res.json()).resolves.toEqual({})
  })
  it("before pode trocar os args (anexar cabeçalho) e retry chama o fetch original", async () => {
    const { fetchFn, calls } = fakeFetch(423)
    const target = { fetch: fetchFn }
    const host = createInterceptorHost(target)
    host.install({
      before: (args) => withHeader(args, "x-t", "1"),
      after: async (res, args, tools) => (res.status === 423 ? tools.retry(withHeader(args, "x-t", "2")) : null),
    }, 10)
    await target.fetch("/api/x", { method: "POST" })
    expect(new Headers(calls[0][1]?.headers).get("x-t")).toBe("1")
    expect(new Headers(calls[1][1]?.headers).get("x-t")).toBe("2")
  })
})

describe("isEligibleWrite", () => {
  const origin = "http://localhost:3000"
  it("aceita /api sem corpo, com string e com FormData", () => {
    expect(isEligibleWrite(["/api/transactions/1/quick-pay", { method: "POST" }], origin)).toBe(true)
    expect(isEligibleWrite(["/api/transactions", { method: "POST", body: "{}" }], origin)).toBe(true)
    expect(isEligibleWrite(["/api/x", { method: "DELETE" }], origin)).toBe(true)
  })
  it("recusa GET, outra origem e fora de /api", () => {
    expect(isEligibleWrite(["/api/x", undefined], origin)).toBe(false)
    expect(isEligibleWrite(["https://other.test/api/x", { method: "POST" }], origin)).toBe(false)
    expect(isEligibleWrite(["/budget", { method: "POST" }], origin)).toBe(false)
  })
  it("recusa um Request pronto mesmo quando tudo mais está certo", () => {
    // O init POST é obrigatório aqui: com init undefined o método cairia em GET e a recusa viria
    // do método, não do tipo do input — a regra do tipo ficaria sem teste nenhum.
    expect(
      isEligibleWrite([new Request("http://localhost:3000/api/x", { method: "POST" }), { method: "POST" }], origin),
    ).toBe(false)
  })
  it("recusa corpo em stream (o interceptador não consegue repetir um corpo já lido)", () => {
    expect(isEligibleWrite(["/api/x", { method: "POST", body: new ReadableStream() }], origin)).toBe(false)
  })
  it("sem origem utilizável (SSR) devolve false em vez de lançar", () => {
    expect(() => isEligibleWrite(["/api/x", { method: "POST" }], "")).not.toThrow()
    expect(isEligibleWrite(["/api/x", { method: "POST" }], "")).toBe(false)
  })
})
