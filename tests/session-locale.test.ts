import { describe, expect, it } from "vitest"
import { NextResponse } from "next/server"
import { LOCALE_COOKIE_NAME } from "../src/i18n/config"
import { LOCALE_COOKIE_MAX_AGE, applySessionLocaleCookie, pickSessionLocale } from "../src/i18n/session-locale"

/** O idioma salvo no perfil (preferencesJson.locale) acompanha a pessoa ao abrir sessão. */
describe("pickSessionLocale", () => {
  it("devolve o idioma salvo quando é um dos idiomas do app", () => {
    expect(pickSessionLocale({ locale: "pt-BR" })).toBe("pt-BR")
    expect(pickSessionLocale({ locale: "es-419", monetary: { currency: "USD" } })).toBe("es-419")
  })

  it("devolve null sem preferência, com idioma inválido ou com valor que não é objeto", () => {
    expect(pickSessionLocale(null)).toBeNull()
    expect(pickSessionLocale(undefined)).toBeNull()
    expect(pickSessionLocale({})).toBeNull()
    expect(pickSessionLocale({ locale: "xx" })).toBeNull()
    expect(pickSessionLocale({ locale: "pt" })).toBeNull()
    expect(pickSessionLocale({ locale: 42 })).toBeNull()
    expect(pickSessionLocale("pt-BR")).toBeNull()
    expect(pickSessionLocale(["pt-BR"])).toBeNull()
  })
})

describe("applySessionLocaleCookie", () => {
  it("grava NEXT_LOCALE com os mesmos atributos do seletor (1 ano, /, visível ao navegador, Lax)", () => {
    const response = NextResponse.json({ ok: true })
    expect(applySessionLocaleCookie(response, { locale: "pt-BR" })).toBe("pt-BR")

    const cookie = response.headers.getSetCookie().find((c) => c.startsWith(`${LOCALE_COOKIE_NAME}=`))
    expect(cookie).toBeDefined()
    expect(cookie).toContain(`${LOCALE_COOKIE_NAME}=pt-BR`)
    expect(cookie).toMatch(/path=\//i)
    expect(cookie).toMatch(new RegExp(`max-age=${LOCALE_COOKIE_MAX_AGE}`, "i"))
    expect(cookie).toMatch(/samesite=lax/i)
    expect(cookie).not.toMatch(/httponly/i)
    expect(LOCALE_COOKIE_MAX_AGE).toBe(31536000)
  })

  it("sem preferência válida não grava cookie nenhum (mantém padrão/env)", () => {
    const response = NextResponse.json({ ok: true })
    expect(applySessionLocaleCookie(response, null)).toBeNull()
    expect(applySessionLocaleCookie(response, { locale: "xx" })).toBeNull()
    expect(response.headers.getSetCookie()).toEqual([])
  })
})
