import { describe, expect, it } from "vitest"
import { parseMonetaryInput } from "../src/lib/monetary"

const brl = { currency: "BRL" } as const
const usd = { currency: "USD" } as const
const eur = { currency: "EUR" } as const

describe("parseMonetaryInput", () => {
  it("vazio é nulo, não zero", () => {
    expect(parseMonetaryInput("", brl)).toBeNull()
    expect(parseMonetaryInput("   ", brl)).toBeNull()
  })

  it("lê o formato da própria moeda", () => {
    expect(parseMonetaryInput("10.000,00", brl)).toBe(10000)
    expect(parseMonetaryInput("10,000.00", usd)).toBe(10000)
    expect(parseMonetaryInput("10.000,00", eur)).toBe(10000)
  })

  it("milhar sem centavos", () => {
    expect(parseMonetaryInput("1.500", brl)).toBe(1500)
    expect(parseMonetaryInput("1,500", usd)).toBe(1500)
    expect(parseMonetaryInput("1.234.567,89", brl)).toBe(1234567.89)
  })

  it("número cru continua valendo", () => {
    expect(parseMonetaryInput("10000", brl)).toBe(10000)
    expect(parseMonetaryInput("0", brl)).toBe(0)
    expect(parseMonetaryInput("7500,5", brl)).toBe(7500.5)
  })

  it("separador de milhar só vale seguido de três dígitos, então o engano vira decimal", () => {
    expect(parseMonetaryInput("10.50", brl)).toBe(10.5)
    expect(parseMonetaryInput("10.5", brl)).toBe(10.5)
  })

  it("engole espaço, inclusive os finos que alguns locales usam", () => {
    expect(parseMonetaryInput("10 000,00", brl)).toBe(10000)
    expect(parseMonetaryInput("10\u00A0000,00", brl)).toBe(10000)
    expect(parseMonetaryInput("10\u202F000,00", brl)).toBe(10000)
  })

  it("lixo é nulo", () => {
    expect(parseMonetaryInput("abc", brl)).toBeNull()
    expect(parseMonetaryInput("1,2,3.4.5", usd)).toBeNull()
    expect(parseMonetaryInput("-", brl)).toBeNull()
    expect(parseMonetaryInput("R$", brl)).toBeNull()
  })

  it("negativo é lido, quem recusa é a validação", () => {
    expect(parseMonetaryInput("-500", brl)).toBe(-500)
  })
})
