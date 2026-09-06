import { describe, expect, it } from "vitest"
import {
  defaultRadarPreferences,
  effectiveAmber,
  resolveRadarPreferences,
  validateRadarPreferences,
} from "../src/features/radar/lib/radar-preferences"

/** `preferences_json.radar` pode não existir, estar pela metade ou vir estragado. */
describe("resolveRadarPreferences", () => {
  it("nada gravado: olhar 30 dias à frente, 100/nulo/300", () => {
    expect(resolveRadarPreferences(undefined)).toEqual(defaultRadarPreferences)
    expect(resolveRadarPreferences(null)).toEqual(defaultRadarPreferences)
    expect(resolveRadarPreferences("lixo")).toEqual(defaultRadarPreferences)
    expect(resolveRadarPreferences([1, 2])).toEqual(defaultRadarPreferences)
  })

  it("aceita o que é válido", () => {
    expect(
      resolveRadarPreferences({ mode: "today", horizonDays: 45, green: 10000, amber: 7000, red: 5000 }),
    ).toEqual({ mode: "today", horizonDays: 45, green: 10000, amber: 7000, red: 5000 })
  })

  it("dias fora de 1..365 caem no padrão", () => {
    expect(resolveRadarPreferences({ horizonDays: 0 }).horizonDays).toBe(30)
    expect(resolveRadarPreferences({ horizonDays: 366 }).horizonDays).toBe(30)
    expect(resolveRadarPreferences({ horizonDays: 30.5 }).horizonDays).toBe(30)
  })

  it("limiares inconsistentes voltam aos três padrões juntos", () => {
    expect(resolveRadarPreferences({ green: 100, amber: null, red: 300 })).toEqual(
      defaultRadarPreferences,
    )
    expect(resolveRadarPreferences({ green: 300, amber: null, red: 300 })).toEqual(
      defaultRadarPreferences,
    )
    expect(resolveRadarPreferences({ green: -5, amber: null, red: -50 })).toEqual(
      defaultRadarPreferences,
    )
  })

  it("âmbar fora do intervalo vira automático, sem derrubar verde e vermelho", () => {
    expect(resolveRadarPreferences({ green: 10000, amber: 20000, red: 5000 })).toEqual({
      ...defaultRadarPreferences,
      green: 10000,
      amber: null,
      red: 5000,
    })
    expect(resolveRadarPreferences({ green: 10000, amber: 5000, red: 5000 }).amber).toBeNull()
  })

  it("modo desconhecido vira lookahead", () => {
    expect(resolveRadarPreferences({ mode: "qualquer" }).mode).toBe("lookahead")
  })
})

describe("effectiveAmber", () => {
  it("nulo é a média exata entre verde e vermelho", () => {
    expect(effectiveAmber({ ...defaultRadarPreferences, green: 10000, amber: null, red: 5000 })).toBe(7500)
  })

  it("número fixado pelo dono manda", () => {
    expect(effectiveAmber({ ...defaultRadarPreferences, green: 10000, amber: 7000, red: 5000 })).toBe(7000)
  })
})

describe("validateRadarPreferences", () => {
  it("recusa o que o resolvedor apenas consertaria", () => {
    expect(validateRadarPreferences({ green: 100, amber: null, red: 300, mode: "lookahead", horizonDays: 30 }).ok).toBe(false)
    expect(validateRadarPreferences({ green: 300, amber: 400, red: 100, mode: "lookahead", horizonDays: 30 }).ok).toBe(false)
    expect(validateRadarPreferences({ green: 300, amber: null, red: 100, mode: "lookahead", horizonDays: 0 }).ok).toBe(false)
    expect(validateRadarPreferences({ green: 300, amber: null, red: -1, mode: "lookahead", horizonDays: 30 }).ok).toBe(false)
    expect(validateRadarPreferences({ green: Infinity, amber: null, red: 100, mode: "lookahead", horizonDays: 30 }).ok).toBe(false)
    expect(validateRadarPreferences("lixo").ok).toBe(false)
    expect(validateRadarPreferences({ green: "300", amber: null, red: 100, mode: "lookahead", horizonDays: 30 }).ok).toBe(false)
  })

  it("aceita o que está inteiro e devolve o objeto limpo", () => {
    const result = validateRadarPreferences({
      mode: "today",
      horizonDays: 60,
      green: 10000,
      amber: 7000,
      red: 5000,
      lixoExtra: 1,
    })
    expect(result).toEqual({
      ok: true,
      value: { mode: "today", horizonDays: 60, green: 10000, amber: 7000, red: 5000 },
    })
  })

  it("aceita zero como piso vermelho", () => {
    expect(validateRadarPreferences({ mode: "lookahead", horizonDays: 30, green: 300, amber: null, red: 0 }).ok).toBe(true)
  })
})
