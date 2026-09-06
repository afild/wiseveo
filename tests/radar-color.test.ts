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

  it("pivô colado numa das pontas continua sadio", () => {
    const nearFloor = { ...prefs, amber: 5001 }
    expect(radarColorFor(5000.5, nearFloor)).not.toContain("NaN")
    expect(radarColorFor(9000, nearFloor)).toBe(
      "color-mix(in oklab, var(--positive) 80%, var(--warning))",
    )

    const nearCeiling = { ...prefs, amber: 9999 }
    expect(radarColorFor(7499.5, nearCeiling)).toBe(
      "color-mix(in oklab, var(--warning) 50%, var(--destructive))",
    )
    expect(radarColorFor(9999.5, nearCeiling)).not.toContain("NaN")
  })

  it("valor não finito cai no neutro em vez de gerar CSS quebrado", () => {
    expect(radarColorFor(Number.NaN, prefs)).toBe("var(--sidebar-accent-foreground)")
    expect(radarColorFor(Number.POSITIVE_INFINITY, prefs)).toBe("var(--sidebar-accent-foreground)")
  })

  // A validação garante red < amber < green nos números GRAVADOS, mas a média calculada pode
  // colapsar por arredondamento. Estes três casos passam pelo validador estrito. Nenhum chega
  // na guarda de denominador: os dois primeiros colapsam para o próprio piso no literal, e o
  // terceiro estoura o âmbar para Infinity e sai pelo atalho de 0%. Os três têm que sair
  // vermelho puro, e é isso que se afirma aqui em vez de um "não contém NaN" que aceita tudo.
  it("faixa colapsada por arredondamento sai vermelho puro, não cor quebrada", () => {
    const collapsed = { ...defaultRadarPreferences, green: 1.0000000000000002, amber: null, red: 1 }
    expect(radarColorFor(1.0000000000000001, collapsed)).toBe("var(--destructive)")

    const tiny = { ...defaultRadarPreferences, green: 5e-324, amber: null, red: 0 }
    expect(radarColorFor(1e-324, tiny)).toBe("var(--destructive)")

    const huge = { ...defaultRadarPreferences, green: 1.7e308, amber: null, red: 1.6e308 }
    expect(radarColorFor(1.65e308, huge)).toBe("var(--destructive)")
  })

  // O único caminho que alcança a guarda `!Number.isFinite(ratio)` dentro de `mix`. O validador
  // da Task 1 recusa NaN no âmbar, mas o tipo permite, e sem a guarda a saída viria com "NaN%".
  it("âmbar NaN não vaza NaN para o CSS", () => {
    const broken = { ...defaultRadarPreferences, green: 10000, amber: Number.NaN, red: 5000 }
    const color = radarColorFor(7000, broken)
    expect(color).not.toContain("NaN")
    expect(color).toBe("var(--positive)")
  })

  // Sem o atalho `percent === 0`, esta razão sairia como "color-mix(... 0%, ...)", que é CSS
  // válido mas verboso e que esconde que a resposta é simplesmente a âncora de baixo.
  it("razão que arredonda para zero devolve a âncora, não uma mistura de 0%", () => {
    // 5012 está a 0,48% do caminho entre 5000 e 7500: arredonda para 0. Nesse trecho mix()
    // recebe (target=AMBER, base=RED), e percent === 0 devolve o base: vermelho puro.
    expect(radarColorFor(5012, prefs)).toBe("var(--destructive)")
    // e a 0,52% já vira 1%
    expect(radarColorFor(5013, prefs)).toBe(
      "color-mix(in oklab, var(--warning) 1%, var(--destructive))",
    )
  })
})
