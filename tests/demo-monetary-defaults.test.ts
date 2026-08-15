import { describe, it, expect } from "vitest"
import {
  DEMO_DEFAULT_CURRENCY,
  defaultMonetarySettings,
  demoMonetarySettings,
  formatMonetaryValue,
  resolveMonetarySettings,
} from "../src/lib/monetary"

/**
 * O usuário DEMO nasce em en-US e, por coerência, em dólar (Configurações → Moeda).
 * O provisionamento grava `demoMonetarySettings` em preferencesJson.monetary; aqui
 * garantimos que o resolvedor aceita esse valor sem cair no padrão BRL.
 */
describe("demoMonetarySettings — moeda inicial do usuário demo", () => {
  it("é USD e sobrevive ao resolvedor", () => {
    expect(DEMO_DEFAULT_CURRENCY).toBe("USD")
    expect(resolveMonetarySettings(demoMonetarySettings).currency).toBe("USD")
  })

  it("só a moeda difere do padrão global", () => {
    expect(demoMonetarySettings.displayMode).toBe(defaultMonetarySettings.displayMode)
    expect(demoMonetarySettings.negativeFormat).toBe(defaultMonetarySettings.negativeFormat)
    expect(defaultMonetarySettings.currency).toBe("BRL")
  })

  it("formata no locale do dólar", () => {
    expect(formatMonetaryValue(1234.5, { ...demoMonetarySettings, displayMode: "symbol" })).toBe(
      "$1,234.50",
    )
  })
})
