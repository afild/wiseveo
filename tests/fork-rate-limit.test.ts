import { describe, expect, it } from "vitest"
import { createForkRateLimiter } from "@/lib/fork-rate-limit"

describe("fork rate limiter", () => {
  it("permite 3 e recusa a 4ª dentro da janela", () => {
    const allow = createForkRateLimiter({ max: 3, windowMs: 600_000 })
    expect(allow("1.2.3.4", 0)).toBe(true)
    expect(allow("1.2.3.4", 1)).toBe(true)
    expect(allow("1.2.3.4", 2)).toBe(true)
    expect(allow("1.2.3.4", 3)).toBe(false)
  })

  it("libera quando a janela passa, não mistura IPs e a recusa não estende a janela", () => {
    const allow = createForkRateLimiter({ max: 1, windowMs: 1000 })
    expect(allow("a", 0)).toBe(true)
    expect(allow("b", 0)).toBe(true)
    expect(allow("a", 500)).toBe(false)
    expect(allow("a", 900)).toBe(false)
    expect(allow("a", 1001)).toBe(true)
  })
})
