import { describe, expect, it } from "vitest"
import { purposeOf, stateWithPurpose } from "../src/lib/google-oauth-state"

/**
 * O Drive e a Agenda voltam pelo MESMO callback do Google. O que diz para onde ir depois
 * é um sufixo no `state`; o valor aleatório continua lá, e o cookie guarda o state
 * inteiro, então a comparação anti-CSRF do callback não muda.
 */
describe("stateWithPurpose", () => {
  it("agenda é o valor cru, sem sufixo (compatível com o cookie de hoje)", () => {
    expect(stateWithPurpose("abc123", "calendar")).toBe("abc123")
  })
  it("backup ganha o sufixo .backup", () => {
    expect(stateWithPurpose("abc123", "backup")).toBe("abc123.backup")
  })
})

describe("purposeOf", () => {
  it("lê o sufixo e cai em agenda para tudo que não for backup", () => {
    expect(purposeOf("abc123.backup")).toBe("backup")
    expect(purposeOf("abc123")).toBe("calendar")
    expect(purposeOf("abc123.outro")).toBe("calendar")
    expect(purposeOf(null)).toBe("calendar")
    expect(purposeOf(undefined)).toBe("calendar")
  })
})
