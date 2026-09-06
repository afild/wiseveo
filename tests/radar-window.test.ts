import { describe, expect, it } from "vitest"
import {
  endOfPeriodUtc,
  nextPeriod,
  pickWorstAhead,
  resolveLaunchedThrough,
} from "../src/features/radar/lib/radar-window"

describe("nextPeriod", () => {
  it("anda um mês e vira o ano", () => {
    expect(nextPeriod("202609")).toBe("202610")
    expect(nextPeriod("202612")).toBe("202701")
  })
})

describe("endOfPeriodUtc", () => {
  it("devolve o último dia do mês em UTC", () => {
    expect(endOfPeriodUtc("202609").toISOString()).toBe("2026-09-30T00:00:00.000Z")
    expect(endOfPeriodUtc("202602").toISOString()).toBe("2026-02-28T00:00:00.000Z")
    expect(endOfPeriodUtc("202412").toISOString()).toBe("2024-12-31T00:00:00.000Z")
  })
})

describe("pickWorstAhead", () => {
  const points = [
    { date: "2026-09-01", balance: 12000 },
    { date: "2026-09-06", balance: 8000 },
    { date: "2026-09-12", balance: 2000 },
    { date: "2026-09-25", balance: 11000 },
    { date: "2026-09-30", balance: 11000 },
  ]

  it("acha o vale entre hoje e o horizonte", () => {
    expect(pickWorstAhead(points, "2026-09-06", "2026-09-30")).toEqual({
      date: "2026-09-12",
      balance: 2000,
    })
  })

  it("ignora o passado, mesmo sendo mais baixo", () => {
    const withLowPast = [{ date: "2026-09-02", balance: -500 }, ...points]
    expect(pickWorstAhead(withLowPast, "2026-09-06", "2026-09-30")?.balance).toBe(2000)
  })

  it("horizonte curto corta o vale de fora", () => {
    expect(pickWorstAhead(points, "2026-09-06", "2026-09-10")).toEqual({
      date: "2026-09-06",
      balance: 8000,
    })
  })

  it("empate fica com o dia mais próximo, que é o mais urgente", () => {
    const tied = [
      { date: "2026-09-06", balance: 500 },
      { date: "2026-09-20", balance: 500 },
    ]
    expect(pickWorstAhead(tied, "2026-09-06", "2026-09-30")?.date).toBe("2026-09-06")
  })

  it("nada na janela é nulo", () => {
    expect(pickWorstAhead(points, "2026-10-01", "2026-10-30")).toBeNull()
    expect(pickWorstAhead([], "2026-09-06", "2026-09-30")).toBeNull()
  })
})

describe("resolveLaunchedThrough", () => {
  // rotina do dono: mês corrente cheio, mês seguinte só com parcelas soltas
  const counts = [
    { period: "202606", count: 88 },
    { period: "202607", count: 92 },
    { period: "202608", count: 90 },
    { period: "202609", count: 85 },
    { period: "202610", count: 6 },
  ]

  it("para no fim do mês corrente quando o seguinte só tem parcelas", () => {
    expect(resolveLaunchedThrough(counts, "202609")).toEqual({
      kind: "launched",
      through: "202609",
    })
  })

  it("estica quando o dono já lançou o mês seguinte", () => {
    const launched = counts.map((c) => (c.period === "202610" ? { ...c, count: 80 } : c))
    expect(resolveLaunchedThrough(launched, "202609")).toEqual({
      kind: "launched",
      through: "202610",
    })
  })

  it("40% da mediana já conta como lançado", () => {
    // mediana dos fechados (88, 92, 90) = 90; piso = 36
    const partial = counts.map((c) => (c.period === "202610" ? { ...c, count: 36 } : c))
    expect(resolveLaunchedThrough(partial, "202609")).toEqual({
      kind: "launched",
      through: "202610",
    })
    const justBelow = counts.map((c) => (c.period === "202610" ? { ...c, count: 35 } : c))
    expect(resolveLaunchedThrough(justBelow, "202609")).toEqual({
      kind: "launched",
      through: "202609",
    })
  })

  it("instalação sem três meses fechados não sofre corte nenhum", () => {
    expect(resolveLaunchedThrough([{ period: "202609", count: 4 }], "202609")).toEqual({
      kind: "no-baseline",
    })
    expect(
      resolveLaunchedThrough(
        [
          { period: "202608", count: 50 },
          { period: "202609", count: 50 },
        ],
        "202609",
      ),
    ).toEqual({ kind: "no-baseline" })
  })

  it("mediana zero também é ausência de base", () => {
    expect(
      resolveLaunchedThrough(
        [
          { period: "202606", count: 0 },
          { period: "202607", count: 0 },
          { period: "202608", count: 0 },
          { period: "202609", count: 10 },
        ],
        "202609",
      ),
    ).toEqual({ kind: "no-baseline" })
  })

  it("mês corrente vazio corta em hoje", () => {
    const emptyCurrent = counts.filter((c) => c.period !== "202609" && c.period !== "202610")
    expect(resolveLaunchedThrough(emptyCurrent, "202609")).toEqual({
      kind: "current-month-empty",
    })
  })

  it("usa só os três fechados mais recentes como base", () => {
    const withOldHuge = [{ period: "202601", count: 5000 }, ...counts]
    // se os 5000 entrassem na mediana, o piso subiria e setembro reprovaria
    expect(resolveLaunchedThrough(withOldHuge, "202609")).toEqual({
      kind: "launched",
      through: "202609",
    })
  })
})
