import { describe, expect, it } from "vitest"
import { isValidLeadEmail, isValidLeadName } from "@/lib/demo-lead"

describe("isValidLeadEmail", () => {
  it("aceita formato comum", () => {
    expect(isValidLeadEmail("ana@example.com")).toBe(true)
    expect(isValidLeadEmail("a.b+c@sub.dominio.com.br")).toBe(true)
  })

  it("recusa vazio, sem @, sem domínio, com espaço e gigante", () => {
    expect(isValidLeadEmail("")).toBe(false)
    expect(isValidLeadEmail("ana")).toBe(false)
    expect(isValidLeadEmail("ana@")).toBe(false)
    expect(isValidLeadEmail("ana@dominio")).toBe(false)
    expect(isValidLeadEmail("a na@example.com")).toBe(false)
    expect(isValidLeadEmail(`${"a".repeat(300)}@example.com`)).toBe(false)
  })
})

describe("isValidLeadName", () => {
  it("aceita nome de 2 letras", () => {
    expect(isValidLeadName("Jo")).toBe(true)
  })

  it("recusa vazio e um único caractere (a rota já faz trim antes: só-espaços vira '')", () => {
    expect(isValidLeadName("")).toBe(false)
    expect(isValidLeadName("A")).toBe(false)
  })
})
