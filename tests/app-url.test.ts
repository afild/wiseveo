import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { getAppUrl, getAppUrlFromHeaders } from "../src/lib/app-url"

/** Endereço público do app: explícito → origem da requisição → produção da Vercel → localhost. */
describe("getAppUrl", () => {
  const saved = { app: process.env.NEXT_PUBLIC_APP_URL, vercel: process.env.VERCEL_PROJECT_PRODUCTION_URL }

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL
  })
  afterEach(() => {
    if (saved.app === undefined) delete process.env.NEXT_PUBLIC_APP_URL
    else process.env.NEXT_PUBLIC_APP_URL = saved.app
    if (saved.vercel === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL
    else process.env.VERCEL_PROJECT_PRODUCTION_URL = saved.vercel
  })

  it("NEXT_PUBLIC_APP_URL explícito vence tudo (sem barra final)", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.wiseveo.com/"
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "outro.vercel.app"
    expect(getAppUrl({ url: "https://preview.example/x" })).toBe("https://app.wiseveo.com")
  })

  it("sem env explícita usa a origem da requisição (o host que a pessoa está usando)", () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "app.wiseveo.com"
    expect(getAppUrl({ url: "https://app.wiseveo.com/api/auth/google?x=1" })).toBe("https://app.wiseveo.com")
  })

  it("sem requisição cai no domínio de produção da Vercel; sem nada, localhost", () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "app.wiseveo.com"
    expect(getAppUrl()).toBe("https://app.wiseveo.com")
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL
    expect(getAppUrl()).toBe("http://localhost:3000")
    expect(getAppUrl({ url: "not a url" })).toBe("http://localhost:3000")
  })
})

/** Server components não recebem `request`: a origem vem dos cabeçalhos. */
describe("getAppUrlFromHeaders", () => {
  const saved = { app: process.env.NEXT_PUBLIC_APP_URL, vercel: process.env.VERCEL_PROJECT_PRODUCTION_URL }
  const h = (entries: Record<string, string>) => new Headers(entries)

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL
  })
  afterEach(() => {
    if (saved.app === undefined) delete process.env.NEXT_PUBLIC_APP_URL
    else process.env.NEXT_PUBLIC_APP_URL = saved.app
    if (saved.vercel === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL
    else process.env.VERCEL_PROJECT_PRODUCTION_URL = saved.vercel
  })

  it("atrás do proxy da Vercel usa x-forwarded-proto + x-forwarded-host (primeiro valor da lista)", () => {
    expect(getAppUrlFromHeaders(h({ "x-forwarded-proto": "https", "x-forwarded-host": "app.wiseveo.com", host: "interno" }))).toBe(
      "https://app.wiseveo.com",
    )
    expect(getAppUrlFromHeaders(h({ "x-forwarded-proto": "https, http", "x-forwarded-host": "app.wiseveo.com, proxy" }))).toBe(
      "https://app.wiseveo.com",
    )
  })

  it("fora da rede local é sempre https (mesmo se o proxy TLS não repassar o esquema); na rede local, http", () => {
    expect(getAppUrlFromHeaders(h({ host: "demo.wiseveo.com" }))).toBe("https://demo.wiseveo.com")
    expect(getAppUrlFromHeaders(h({ "x-forwarded-proto": "http", host: "demo.wiseveo.com" }))).toBe("https://demo.wiseveo.com")
    expect(getAppUrlFromHeaders(h({ host: "localhost:3000" }))).toBe("http://localhost:3000")
    expect(getAppUrlFromHeaders(h({ host: "127.0.0.1:3005" }))).toBe("http://127.0.0.1:3005")
    expect(getAppUrlFromHeaders(h({ host: "192.168.1.10:3000" }))).toBe("http://192.168.1.10:3000")
    expect(getAppUrlFromHeaders(h({ "x-forwarded-proto": "https", host: "localhost:3000" }))).toBe("https://localhost:3000")
  })

  it("rotas (getAppUrl(request)) e página (getAppUrlFromHeaders) devolvem o MESMO endereço para os mesmos cabeçalhos", () => {
    // Fora da Vercel, request.url vem do endereço em que o servidor escuta (localhost:porta),
    // não do host pedido — os cabeçalhos têm de vencer para o guia bater com o redirect_uri.
    const lan = new Request("http://localhost:3000/api/auth/google", { headers: { host: "127.0.0.1:3011" } })
    expect(getAppUrl(lan)).toBe("http://127.0.0.1:3011")
    expect(getAppUrl(lan)).toBe(getAppUrlFromHeaders(lan.headers))

    const proxied = new Request("http://localhost:3000/api/auth/google", {
      headers: { host: "localhost:3000", "x-forwarded-host": "app.example.com", "x-forwarded-proto": "https" },
    })
    expect(getAppUrl(proxied)).toBe("https://app.example.com")
    expect(getAppUrl(proxied)).toBe(getAppUrlFromHeaders(proxied.headers))

    // Sem cabeçalhos de host (objeto simples) continua valendo a origem de request.url.
    expect(getAppUrl({ url: "https://preview.example/x" })).toBe("https://preview.example")
  })

  it("NEXT_PUBLIC_APP_URL explícito vence o host; sem host cai nos padrões de getAppUrl", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.wiseveo.com"
    expect(getAppUrlFromHeaders(h({ host: "preview.vercel.app" }))).toBe("https://app.wiseveo.com")
    delete process.env.NEXT_PUBLIC_APP_URL
    expect(getAppUrlFromHeaders(h({}))).toBe("http://localhost:3000")
    expect(getAppUrlFromHeaders(null)).toBe("http://localhost:3000")
  })
})
