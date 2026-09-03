import { describe, expect, it } from "vitest"
import {
  addDays, computeSwitchState, dayKeyOfLocal, dayKeyOfStored, isDayClosed, isDayKey, isPeriodClosed,
  lastDayOfPeriod, lockedForRow, MIN_DAY_KEY, resolveDateClosingPreferences, storedPeriod, toDayKeyInput,
  toPeriodInput,
} from "@/features/security/lib/date-closing"

/**
 * Porta de entrada das rotas: a guarda recusa chave fora do formato, então o que não for data
 * (ou competência) legível tem de virar null ali, e não 500 lá dentro.
 */
describe("entrada de rota", () => {
  it("toDayKeyInput deixa a chave de dia passar intacta", () => {
    expect(toDayKeyInput("2026-08-31")).toBe("2026-08-31")
    expect(toDayKeyInput(" 2026-08-31 ")).toBe("2026-08-31")
  })
  it("toDayKeyInput reduz um instante ISO ao dia UTC que seria gravado", () => {
    expect(toDayKeyInput("2026-08-31T00:00:00.000Z")).toBe("2026-08-31")
    expect(toDayKeyInput("2026-08-31T23:00:00-05:00")).toBe("2026-09-01")
  })
  it("toDayKeyInput recusa o que não é data", () => {
    for (const bad of ["31/08/2026", "202608", "ontem", "", "2026-13-01", 20260831, null, undefined]) {
      expect(toDayKeyInput(bad), String(bad)).toBeNull()
    }
  })
  it("toPeriodInput só aceita YYYYMM, como texto ou número", () => {
    expect(toPeriodInput("202608")).toBe("202608")
    expect(toPeriodInput(202608)).toBe("202608")
    for (const bad of ["2026-08", "20268", "202613", "", 2026.5, null, undefined]) {
      expect(toPeriodInput(bad), String(bad)).toBeNull()
    }
  })
  /**
   * Ano abaixo de 1900 é entrada INVÁLIDA (400), nunca competência fechada (423): `Date.UTC` joga
   * os anos 0-99 para os anos 1900, então "000012" cai em 31/12/1900, antes de qualquer corte real.
   */
  it("toPeriodInput recusa ano abaixo do piso e aceita o primeiro ano válido", () => {
    expect(toPeriodInput("190001")).toBe("190001")
    expect(toPeriodInput(190012)).toBe("190012")
    for (const bad of ["189912", "000012", "000101", 189912]) {
      expect(toPeriodInput(bad), String(bad)).toBeNull()
    }
    // O porquê do piso, preto no branco: sem ele, este valor passaria por mês já fechado.
    expect(lastDayOfPeriod("000012")).toBe("1900-12-31")
  })
})

/**
 * Competência já GRAVADA (coluna `char(6)`, com anos de histórico): o que não for legível vira
 * null, e a trava simplesmente pula a competência. O dia da própria linha continua conferido.
 */
describe("competência lida do banco", () => {
  it("storedPeriod aceita YYYYMM e tolera o padding de espaço da coluna char(6)", () => {
    expect(storedPeriod("202608")).toBe("202608")
    expect(storedPeriod(" 202608 ")).toBe("202608")
  })
  it("storedPeriod devolve null para lixo antigo, vazio e ausente", () => {
    for (const bad of ["20268 ", "      ", "000000", "202613", "2026-08", "", null, undefined]) {
      expect(storedPeriod(bad), String(bad)).toBeNull()
    }
  })
  /**
   * Mesmo piso do `toPeriodInput`, e pela mesma razão: `Date.UTC` joga os anos 0-99 para os anos
   * 1900, então "000112" viraria 31/12/1901 em `lastDayOfPeriod` e uma edição comum voltaria com
   * "data fechada" (423). Ano absurdo é lixo antigo: null, e a competência sai da conta.
   */
  it("storedPeriod recusa ano abaixo do piso e aceita o primeiro ano válido", () => {
    expect(storedPeriod("190001")).toBe("190001")
    for (const bad of ["000112", "000012", "000101", "189912"]) {
      expect(storedPeriod(bad), String(bad)).toBeNull()
    }
    // O que aconteceria sem o piso: um mês nos anos 1900, anterior a qualquer corte real.
    expect(lastDayOfPeriod("000112")).toBe("1901-12-31")
    expect(isPeriodClosed("000112", "2026-08-31")).toBe(true)
  })
})

describe("chaves de dia", () => {
  it("dayKeyOfStored lê os componentes UTC do meio-dia UTC", () => {
    expect(dayKeyOfStored(new Date("2026-08-31T12:00:00.000Z"))).toBe("2026-08-31")
  })
  it("dayKeyOfLocal lê os componentes locais (fim de mês local não vira o dia seguinte)", () => {
    const local = new Date(2026, 7, 31, 23, 59, 59, 999)
    expect(dayKeyOfLocal(local)).toBe("2026-08-31")
  })
  it("addDays soma e subtrai dias de calendário", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01")
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
  })
  it("isDayKey aceita data real e recusa dia que não existe no calendário", () => {
    expect(isDayKey("2026-08-31")).toBe(true)
    expect(isDayKey("2024-02-29")).toBe(true)
    expect(isDayKey("2026-02-29")).toBe(false)
    expect(isDayKey("2026-02-30")).toBe(false)
    expect(isDayKey("2026-04-31")).toBe(false)
    expect(isDayKey("31/08/2026")).toBe(false)
    expect(isDayKey(20260831)).toBe(false)
  })
})

describe("dia e competência fechados", () => {
  it("sem corte nada está fechado", () => expect(isDayClosed("2020-01-01", null)).toBe(false))
  it("dia <= corte está fechado", () => {
    expect(isDayClosed("2026-08-31", "2026-08-31")).toBe(true)
    expect(isDayClosed("2026-09-01", "2026-08-31")).toBe(false)
  })
  it("competência fechada só quando o mês inteiro cabe no corte", () => {
    expect(lastDayOfPeriod("202608")).toBe("2026-08-31")
    expect(isPeriodClosed("202608", "2026-08-31")).toBe(true)
    expect(isPeriodClosed("202609", "2026-09-15")).toBe(false)
    expect(isPeriodClosed("2026xx", "2026-09-15")).toBe(false)
  })
})

/**
 * O CADEADO da tabela e do cartão do celular. A decisão saiu de dentro da célula para cá porque
 * nenhum componente é testável neste projeto (o vitest é só Node): uma troca de `dayKeyOfStored`
 * por `dayKeyOfLocal` na célula passou batida por toda a suíte.
 *
 * O caso que segura a regra é a linha que NÃO está ao meio-dia UTC — histórico antigo gravado à
 * meia-noite. Com o fuso do processo em America/New_York (fixado no vitest.config.ts), meia-noite
 * UTC do dia 02 é ainda o dia 01 na tela: derivar pelo dia local jogaria essa linha para dentro do
 * corte e ela apareceria trancada sem estar.
 */
describe("lockedForRow (o cadeado da linha)", () => {
  it("sem corte, nenhuma linha tranca", () => {
    expect(lockedForRow("2020-01-01T12:00:00.000Z", null)).toBe(false)
  })
  it("linha gravada ao meio-dia UTC: dentro do corte tranca, depois dele não", () => {
    expect(lockedForRow("2026-08-31T12:00:00.000Z", "2026-08-31")).toBe(true)
    expect(lockedForRow("2026-09-01T12:00:00.000Z", "2026-08-31")).toBe(false)
  })
  it("linha à meia-noite UTC segue o dia UTC, não o dia de quem olha", () => {
    // 2026-09-02T00:00Z é 01/09 às 20h em Nova York: pelo dia local esta linha entraria no corte.
    expect(dayKeyOfStored(new Date("2026-09-02T00:00:00.000Z"))).toBe("2026-09-02")
    expect(dayKeyOfLocal(new Date("2026-09-02T00:00:00.000Z"))).toBe("2026-09-01")
    expect(lockedForRow("2026-09-02T00:00:00.000Z", "2026-09-01")).toBe(false)
    expect(lockedForRow(new Date("2026-09-01T00:00:00.000Z"), "2026-08-31")).toBe(false)
  })
  it("data ilegível não tranca nada", () => {
    expect(lockedForRow("ontem", "2026-08-31")).toBe(false)
  })
})

/** O piso do seletor de data: abaixo dele a rota nem lê a chave (400), então nem é oferecido. */
describe("MIN_DAY_KEY", () => {
  it("é chave de dia válida e o ano é o mesmo piso da competência", () => {
    expect(isDayKey(MIN_DAY_KEY)).toBe(true)
    expect(MIN_DAY_KEY).toBe("1900-01-01")
    expect(toPeriodInput("190001")).toBe("190001")
    expect(isDayKey("0026-09-01")).toBe(false)
  })
})

describe("resolveDateClosingPreferences", () => {
  it("lixo vira o padrão completo", () => {
    expect(resolveDateClosingPreferences(null)).toEqual({
      closedThrough: null, pinHash: null, pinUpdatedAt: null, pinFailures: { count: 0, lockedUntil: null },
    })
    expect(resolveDateClosingPreferences({ closedThrough: "31/08/2026", pinFailures: { count: "x" } })).toEqual({
      closedThrough: null, pinHash: null, pinUpdatedAt: null, pinFailures: { count: 0, lockedUntil: null },
    })
  })
  it("valores válidos passam", () => {
    expect(resolveDateClosingPreferences({ closedThrough: "2026-08-31", pinHash: "h", pinFailures: { count: 2, lockedUntil: null } }))
      .toMatchObject({ closedThrough: "2026-08-31", pinHash: "h", pinFailures: { count: 2 } })
  })
  it("corte com data que não existe no calendário vira null", () => {
    expect(resolveDateClosingPreferences({ closedThrough: "2026-02-30" }).closedThrough).toBeNull()
    expect(resolveDateClosingPreferences({ closedThrough: "2026-02-29" }).closedThrough).toBeNull()
    expect(resolveDateClosingPreferences({ closedThrough: "2026-04-31" }).closedThrough).toBeNull()
  })
  it("corte com data real passa, inclusive 29 de fevereiro em ano bissexto", () => {
    expect(resolveDateClosingPreferences({ closedThrough: "2026-02-28" }).closedThrough).toBe("2026-02-28")
    expect(resolveDateClosingPreferences({ closedThrough: "2024-02-29" }).closedThrough).toBe("2024-02-29")
  })
})

describe("computeSwitchState (tabela ordenada da seção 7)", () => {
  const today = "2026-09-02"
  it("1: período todo no futuro é 'nada a fechar'", () => {
    expect(computeSwitchState({ from: "2026-09-03", to: "2026-09-10", today, closedThrough: "2026-09-02" }))
      .toEqual({ checked: false, disabled: true, label: "nothingToClose", closeTarget: null, reopenFrom: null })
  })
  it("2: sem corte é aberto e ligar fecha até to*", () => {
    expect(computeSwitchState({ from: "2026-09-01", to: "2026-09-30", today, closedThrough: null }))
      .toEqual({ checked: false, disabled: false, label: "open", closeTarget: "2026-09-02", reopenFrom: null })
  })
  it("3: tudo fechável fechado é ligado, mesmo com 'to' no futuro", () => {
    expect(computeSwitchState({ from: "2026-09-01", to: "2026-09-30", today, closedThrough: "2026-09-02" }))
      .toEqual({ checked: true, disabled: false, label: "closedThrough", closeTarget: null, reopenFrom: "2026-09-01" })
    expect(computeSwitchState({ from: "2026-09-02", to: "2026-09-02", today, closedThrough: "2026-09-02" }))
      .toEqual({ checked: true, disabled: false, label: "closed", closeTarget: null, reopenFrom: "2026-09-02" })
  })
  it("4: período depois do corte é aberto", () => {
    expect(computeSwitchState({ from: "2026-09-02", to: "2026-09-02", today, closedThrough: "2026-09-01" }))
      .toEqual({ checked: false, disabled: false, label: "open", closeTarget: "2026-09-02", reopenFrom: null })
  })
  it("5: misto é desligado com 'fechado até' e ligar fecha o resto", () => {
    expect(computeSwitchState({ from: "2026-08-25", to: "2026-09-02", today, closedThrough: "2026-08-31" }))
      .toEqual({ checked: false, disabled: false, label: "closedThrough", closeTarget: "2026-09-02", reopenFrom: null })
  })
  it("2 no passado: sem corte, ligar fecha até o fim do período, nunca até hoje", () => {
    expect(computeSwitchState({ from: "2026-07-01", to: "2026-07-31", today, closedThrough: null }))
      .toEqual({ checked: false, disabled: false, label: "open", closeTarget: "2026-07-31", reopenFrom: null })
  })
  it("3 no passado: mês antigo inteiro dentro do corte aparece ligado e fechado", () => {
    expect(computeSwitchState({ from: "2026-07-01", to: "2026-07-31", today, closedThrough: "2026-08-31" }))
      .toEqual({ checked: true, disabled: false, label: "closed", closeTarget: null, reopenFrom: "2026-07-01" })
  })
  it("5 no passado: corte no meio de um mês antigo fecha só o resto daquele mês", () => {
    expect(computeSwitchState({ from: "2026-07-01", to: "2026-07-31", today, closedThrough: "2026-07-15" }))
      .toEqual({ checked: false, disabled: false, label: "closedThrough", closeTarget: "2026-07-31", reopenFrom: null })
  })
})
