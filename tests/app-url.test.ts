import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { getAppUrl } from "../src/lib/app-url"

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
