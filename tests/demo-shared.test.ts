import { describe, expect, it } from "vitest"
import { isBlockedSharedWrite, DEMO_FORK_PATH } from "@/lib/demo-shared"

describe("isBlockedSharedWrite", () => {
  it("nunca bloqueia sessão normal (sem demoShared)", () => {
    expect(isBlockedSharedWrite("POST", "/api/transactions", undefined)).toBe(false)
    expect(isBlockedSharedWrite("DELETE", "/api/transactions/1", false)).toBe(false)
  })
  it("nunca bloqueia leitura", () => {
    expect(isBlockedSharedWrite("GET", "/api/transactions", true)).toBe(false)
    expect(isBlockedSharedWrite("HEAD", "/dashboard", true)).toBe(false)
  })
  it("bloqueia escrita de sessão compartilhada em /api e em página (server action)", () => {
    expect(isBlockedSharedWrite("POST", "/api/transactions", true)).toBe(true)
    expect(isBlockedSharedWrite("PATCH", "/api/user/preferences", true)).toBe(true)
    expect(isBlockedSharedWrite("POST", "/orcamento", true)).toBe(true)
  })
  it("deixa passar o fork e o logout", () => {
    expect(isBlockedSharedWrite("POST", DEMO_FORK_PATH, true)).toBe(false)
    expect(isBlockedSharedWrite("POST", "/api/auth/logout", true)).toBe(false)
  })
})
