import { describe, expect, it } from "vitest"
import { NextResponse } from "next/server"
import { COOKIE_NAME } from "@/lib/auth"
import { DEMO_SHARED_MARKER_COOKIE } from "@/lib/demo-shared"
import { FRESH_SESSION_COOKIE } from "@/lib/client-session-reset"
import { applyDemoSessionCookies } from "@/features/demo/services/demo-session-cookies"

// Trava a montagem ÚNICA de cookies de sessão da demo: entrada e fork chamam
// a MESMA função — cópias separadas divergiriam em silêncio (ver o JSDoc do
// serviço). O que muda entre os dois é só `demoShared` e `freshSession`.
describe("applyDemoSessionCookies", () => {
  it("padrão (entrada): grava sessão, wiseveo-fresh-session e o marcador da vitrine", async () => {
    const response = new NextResponse()
    await applyDemoSessionCookies(response, { userId: "demo_abc", demoShared: true })

    expect(response.cookies.get(COOKIE_NAME)?.value).toBeTruthy()
    expect(response.cookies.get(FRESH_SESSION_COOKIE)?.value).toBe("1")
    expect(response.cookies.get(DEMO_SHARED_MARKER_COOKIE)?.value).toBe("1")
  })

  it("fork (freshSession: false) NÃO grava wiseveo-fresh-session", async () => {
    const response = new NextResponse()
    await applyDemoSessionCookies(response, {
      userId: "demo_abc",
      demoShared: false,
      freshSession: false,
    })

    expect(response.cookies.get(COOKIE_NAME)?.value).toBeTruthy()
    expect(response.cookies.get(FRESH_SESSION_COOKIE)).toBeUndefined()
  })

  it("demoShared: false apaga o marcador da vitrine (valor vazio, max-age 0)", async () => {
    const response = new NextResponse()
    await applyDemoSessionCookies(response, { userId: "demo_abc", demoShared: false })

    expect(response.cookies.get(COOKIE_NAME)?.value).toBeTruthy()
    const cookie = response.headers
      .getSetCookie()
      .find((c) => c.startsWith(`${DEMO_SHARED_MARKER_COOKIE}=`))
    expect(cookie).toBeDefined()
    expect(cookie).toMatch(new RegExp(`^${DEMO_SHARED_MARKER_COOKIE}=;`))
    expect(cookie).toMatch(/max-age=0/i)
  })
})
