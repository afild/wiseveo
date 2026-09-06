import { describe, expect, it } from "vitest"
import { defaultRadarPreferences } from "../src/features/radar/lib/radar-preferences"
import { radarColorFor } from "../src/features/radar/lib/radar-color"

const prefs = { ...defaultRadarPreferences, green: 10000, amber: null, red: 5000 }

describe("radarColorFor", () => {
  it("sem dado ainda: neutro da sidebar", () => {
    expect(radarColorFor(null, prefs)).toBe("var(--sidebar-accent-foreground)")
  })

  it("negativo é vermelho puro, mesmo com piso configurado em zero", () => {
    expect(radarColorFor(-0.01, { ...prefs, red: 0 })).toBe("var(--destructive)")
    expect(radarColorFor(-9999, prefs)).toBe("var(--destructive)")
  })

  it("trava nas pontas", () => {
    expect(radarColorFor(5000, prefs)).toBe("var(--destructive)")
    expect(radarColorFor(4000, prefs)).toBe("var(--destructive)")
    expect(radarColorFor(10000, prefs)).toBe("var(--positive)")
    expect(radarColorFor(99999, prefs)).toBe("var(--positive)")
  })

  it("o pivô automático é a média exata e sai âmbar puro", () => {
    expect(radarColorFor(7500, prefs)).toBe("var(--warning)")
  })

  it("mistura proporcional abaixo do pivô", () => {
    expect(radarColorFor(6250, prefs)).toBe(
      "color-mix(in oklab, var(--warning) 50%, var(--destructive))",
    )
    expect(radarColorFor(7250, prefs)).toBe(
      "color-mix(in oklab, var(--warning) 90%, var(--destructive))",
    )
  })

  it("mistura proporcional acima do pivô", () => {
    expect(radarColorFor(8750, prefs)).toBe(
      "color-mix(in oklab, var(--positive) 50%, var(--warning))",
    )
  })

  it("pivô fixado pelo dono desloca as duas inclinações", () => {
    const fixed = { ...prefs, amber: 7000 }
    expect(radarColorFor(7000, fixed)).toBe("var(--warning)")
    expect(radarColorFor(6000, fixed)).toBe(
      "color-mix(in oklab, var(--warning) 50%, var(--destructive))",
    )
    expect(radarColorFor(8500, fixed)).toBe(
      "color-mix(in oklab, var(--positive) 50%, var(--warning))",
    )
  })

  it("valor não finito cai no neutro em vez de gerar CSS quebrado", () => {
    expect(radarColorFor(Number.NaN, prefs)).toBe("var(--sidebar-accent-foreground)")
    expect(radarColorFor(Number.POSITIVE_INFINITY, prefs)).toBe("var(--sidebar-accent-foreground)")
  })

  // A validação garante red < amber < green nos números GRAVADOS, mas a média calculada pode
  // colapsar por arredondamento. Estes três casos passam pelo validador estrito e chegariam
  // aqui com denominador zero ou infinito. Nenhum pode produzir "NaN%" no CSS.
  it("faixa colapsada por arredondamento não gera cor quebrada", () => {
    const collapsed = { ...defaultRadarPreferences, green: 1.0000000000000002, amber: null, red: 1 }
    expect(radarColorFor(1.0000000000000001, collapsed)).not.toContain("NaN")

    const tiny = { ...defaultRadarPreferences, green: 5e-324, amber: null, red: 0 }
    expect(radarColorFor(1e-324, tiny)).not.toContain("NaN")

    const huge = { ...defaultRadarPreferences, green: 1.7e308, amber: null, red: 1.6e308 }
    expect(radarColorFor(1.65e308, huge)).not.toContain("NaN")
  })
})
