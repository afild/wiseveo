import { describe, expect, it } from "vitest"
import { isValidLeadEmail } from "@/lib/demo-lead"

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
