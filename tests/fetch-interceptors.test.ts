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
  it("o chamador ainda lê o corpo depois de um handler inspecionar com clone", async () => {
    const target = { fetch: fakeFetch(423).fetchFn }
    const host = createInterceptorHost(target)
    host.install({ after: async (res) => { await res.clone().json(); return null } }, 10)
    const res = await target.fetch("/api/x", { method: "POST" })
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
  it("recusa GET, outra origem, fora de /api, Request e stream", () => {
    expect(isEligibleWrite(["/api/x", undefined], origin)).toBe(false)
    expect(isEligibleWrite(["https://other.test/api/x", { method: "POST" }], origin)).toBe(false)
    expect(isEligibleWrite(["/budget", { method: "POST" }], origin)).toBe(false)
    expect(isEligibleWrite([new Request("http://localhost:3000/api/x", { method: "POST" }), undefined], origin)).toBe(false)
  })
})
