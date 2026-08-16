import { describe, it, expect } from "vitest"
import {
  createTable,
  getCoreRowModel,
  type ColumnDef,
  type ColumnSizingInfoState,
  type ColumnSizingState,
  type VisibilityState,
} from "@tanstack/react-table"
import {
  applyFittedResize,
  canResizeColumn,
  distributeWidths,
  getFittedColumnLayout,
  minTableWidth,
} from "../src/components/data-table/use-fitted-column-sizing"

/**
 * Layout "cabe no contêiner" das tabelas de Transações e Recorrentes: as larguras
 * salvas são pesos, o contêiner é medido e os px distribuídos com piso por coluna;
 * fora de um arraste o estado é normalizado (pesos = px na tela); redimensionar tira/dá
 * largura da vizinha à direita (borda acompanha o mouse 1:1).
 */
type Row = { id: string }

const columns: ColumnDef<Row>[] = [
  { id: "select", size: 36, minSize: 36, enableResizing: false },
  { id: "num", size: 72, minSize: 72 },
  { id: "note", size: 200, minSize: 80 },
  { id: "description", size: 200, minSize: 80 },
  { id: "amount", size: 100, minSize: 100 },
  { id: "actions", size: 56, minSize: 56, enableResizing: false },
]

const idleInfo: ColumnSizingInfoState = {
  startOffset: null,
  startSize: null,
  deltaOffset: null,
  deltaPercentage: null,
  isResizingColumn: false,
  columnSizingStart: [],
}

function makeTable(
  columnSizing: ColumnSizingState = {},
  columnVisibility: VisibilityState = {},
  columnSizingInfo: ColumnSizingInfoState = idleInfo,
) {
  return createTable<Row>({
    columns,
    data: [],
    defaultColumn: { minSize: 64, size: 150 },
    state: { columnSizing, columnVisibility, columnSizingInfo },
    onStateChange: () => {},
    renderFallbackValue: null,
    getCoreRowModel: getCoreRowModel(),
  })
}

const sum = (widths: Record<string, number>) => Object.values(widths).reduce((a, b) => a + b, 0)

describe("distributeWidths — cabe no contêiner", () => {
  it("fixas mantêm o tamanho; flexíveis dividem o resto na proporção dos pesos", () => {
    const table = makeTable()
    const w = distributeWidths(table, {}, 1000)
    expect(w.select).toBe(36)
    expect(w.actions).toBe(56)
    // resto = 908; pesos 72/200/200/100 (572) → 114,3 / 317,5 / 317,5 / 158,7 → floor
    // 114/317/317/158 e o resto (2px) vai para as maiores partes fracionárias (valor, notas)
    expect(w.num).toBe(114)
    expect(w.amount).toBe(159)
    expect(w.note + w.description).toBe(635)
    expect(Math.abs(w.note - w.description)).toBeLessThanOrEqual(1)
    expect(sum(w)).toBe(1000)
  })

  it("larguras são inteiras, somam exatamente o contêiner e a distribuição é idempotente", () => {
    const table = makeTable()
    for (const W of [700, 1000, 1221, 1560, 2560]) {
      const w = distributeWidths(table, {}, W)
      expect(Object.values(w).every(Number.isInteger)).toBe(true)
      expect(sum(w)).toBe(W)
      // normalizar de novo (pesos = px) devolve o mesmo mapa: sem oscilação no render
      expect(distributeWidths(makeTable(w), w, W)).toEqual(w)
    }
  })

  it("quem cairia abaixo do piso é pinado e o resto redistribuído", () => {
    const table = makeTable()
    const w = distributeWidths(table, {}, 500)
    // resto = 408; sem pisos amount ficaria 71 (<100) e num 51 (<72) → pinados
    expect(w.num).toBe(72)
    expect(w.amount).toBe(100)
    // sobra 236 para note/description em partes iguais
    expect(w.note).toBe(118)
    expect(w.description).toBe(118)
    expect(sum(w)).toBe(500)
  })

  it("abaixo da soma dos mínimos, a tabela fica nos mínimos (o contêiner rola)", () => {
    const table = makeTable()
    const w = distributeWidths(table, {}, 300)
    expect(w).toEqual({ select: 36, num: 72, note: 80, description: 80, amount: 100, actions: 56 })
    expect(minTableWidth(table, {})).toBe(424)
  })

  it("larguras salvas (px do modelo antigo) valem como pesos", () => {
    const table = makeTable({ note: 600, description: 200 })
    const w = distributeWidths(table, { note: 600, description: 200 }, 1000)
    expect(w.note).toBeGreaterThan(w.description * 2.5)
    expect(sum(w)).toBeLessThanOrEqual(1000)
  })

  it("coluna oculta não entra na conta e as outras preenchem", () => {
    const table = makeTable({}, { note: false })
    const w = distributeWidths(table, {}, 1000)
    expect(w.note).toBeUndefined()
    expect(sum(w)).toBeGreaterThan(996)
  })
})

describe("canResizeColumn — alça só com vizinha à direita", () => {
  it("última flexível (antes de ações) não tem alça; fixas nunca têm", () => {
    const table = makeTable()
    expect(canResizeColumn(table, "select")).toBe(false)
    expect(canResizeColumn(table, "num")).toBe(true)
    expect(canResizeColumn(table, "description")).toBe(true)
    expect(canResizeColumn(table, "amount")).toBe(false)
    expect(canResizeColumn(table, "actions")).toBe(false)
  })

  it("ocultar a última flexível passa a alça para a anterior", () => {
    const table = makeTable({}, { amount: false })
    expect(canResizeColumn(table, "description")).toBe(false)
    expect(canResizeColumn(table, "note")).toBe(true)
  })
})

describe("getFittedColumnLayout — normalização fora do arraste", () => {
  it("estado bruto (defaults) pede normalização; estado já em px não pede", () => {
    const W = 1000
    const raw = makeTable()
    const first = getFittedColumnLayout(raw, W)
    expect(first.normalizedSizing).not.toBeNull()
    expect(sum(first.normalizedSizing!)).toBe(W)

    const normalized = makeTable(first.normalizedSizing!)
    expect(getFittedColumnLayout(normalized, W).normalizedSizing).toBeNull()
    expect(getFittedColumnLayout(normalized, W).widthFor("note")).toBe(first.normalizedSizing!.note)
  })

  it("não normaliza durante um arraste nem antes da medição (largura 0)", () => {
    const dragging: ColumnSizingInfoState = { ...idleInfo, isResizingColumn: "note" }
    expect(getFittedColumnLayout(makeTable({}, {}, dragging), 1000).normalizedSizing).toBeNull()
    const beforeMeasure = getFittedColumnLayout(makeTable(), 0)
    expect(beforeMeasure.normalizedSizing).toBeNull()
    expect(String(beforeMeasure.widthFor("note"))).toMatch(/%$/)
  })

  it("largura do contêiner mudou: as larguras salvas são reescaladas", () => {
    const at1000 = getFittedColumnLayout(makeTable(), 1000).normalizedSizing!
    const at1400 = getFittedColumnLayout(makeTable(at1000), 1400).normalizedSizing!
    expect(sum(at1400)).toBe(1400)
    expect(at1400.note).toBeGreaterThan(at1000.note)
    // proporção entre colunas de texto preservada (diferença só do resto inteiro)
    expect(Math.abs(at1400.note - at1400.description)).toBeLessThanOrEqual(1)
  })
})

describe("applyFittedResize — a vizinha compensa (estado normalizado: alvo é absoluto)", () => {
  const W = 1000
  /** Estado normalizado como o componente mantém fora do arraste. */
  const normalized = () => distributeWidths(makeTable(), {}, W)

  it("arraste: coluna vai para a largura-alvo e a vizinha à direita encolhe o mesmo", () => {
    const prev = normalized()
    const info: ColumnSizingInfoState = {
      ...idleInfo,
      isResizingColumn: "note",
      startSize: prev.note,
      columnSizingStart: [["note", prev.note]],
    }
    const table = makeTable(prev, {}, info)

    // TanStack entrega startSize + deltaOffset (mouse andou +40)
    const next = applyFittedResize(table, prev, { ...prev, note: prev.note + 40 }, W)
    expect(next.note).toBe(prev.note + 40)
    expect(next.description).toBe(prev.description - 40)
    expect(next.amount).toBe(prev.amount)
    expect(sum(next)).toBe(W)

    // movimento seguinte do MESMO arraste (+90 no total): alvo absoluto, sem retrato
    const table2 = makeTable(next, {}, info)
    const next2 = applyFittedResize(table2, next, { ...next, note: prev.note + 90 }, W)
    expect(next2.note).toBe(prev.note + 90)
    expect(next2.description).toBe(prev.description - 90)
  })

  it("mousemove sem variação de X (mesmo valor de novo) não muda nada", () => {
    const prev = normalized()
    const table = makeTable(prev)
    expect(applyFittedResize(table, prev, { ...prev }, W)).toBe(prev)
  })

  it("arraste para na borda quando a vizinha chega ao mínimo e volta sem 'grudar'", () => {
    const prev = normalized()
    const table = makeTable(prev)
    const clamped = applyFittedResize(table, prev, { ...prev, note: prev.note + 5000 }, W)
    expect(clamped.description).toBe(80) // piso da vizinha
    expect(clamped.note).toBe(prev.note + (prev.description - 80))
    expect(sum(clamped)).toBe(W)

    // mouse volta para +100 do início: alvo absoluto → note = início + 100
    const back = applyFittedResize(makeTable(clamped), clamped, { ...clamped, note: prev.note + 100 }, W)
    expect(back.note).toBe(prev.note + 100)
    expect(back.description).toBe(prev.description - 100)
  })

  it("encolher até o próprio mínimo funciona já no primeiro arraste (sem piso pelo peso)", () => {
    const prev = normalized() // note na tela = 317, bem acima do peso 200
    const table = makeTable(prev)
    const next = applyFittedResize(table, prev, { ...prev, note: 0 }, W)
    expect(next.note).toBe(80)
    expect(next.description).toBe(prev.description + (prev.note - 80))
  })

  it("teclado: ±16 sobre a largura na tela", () => {
    const prev = normalized()
    const table = makeTable(prev)
    const next = applyFittedResize(table, prev, { ...prev, num: prev.num + 16 }, W)
    expect(next.num).toBe(prev.num + 16)
    expect(next.note).toBe(prev.note - 16)
  })

  it("reset (chave removida) volta ao tamanho padrão e a vizinha absorve", () => {
    const prev = { ...normalized(), num: 300 }
    const table = makeTable(prev)
    const base = distributeWidths(table, prev, W)
    const { num: _dropped, ...withoutNum } = prev
    void _dropped
    const next = applyFittedResize(table, prev, withoutNum, W)
    expect(next.num).toBe(72)
    expect(next.note).toBe(base.note + (base.num - 72))
  })

  it("mudança em várias chaves (carga do storage) passa intacta", () => {
    const table = makeTable()
    const loaded = { note: 300, description: 250 }
    expect(applyFittedResize(table, {}, loaded, W)).toEqual(loaded)
  })

  it("coluna sem alça (última flexível) ignora a mudança", () => {
    const prev = normalized()
    const table = makeTable(prev)
    expect(applyFittedResize(table, prev, { ...prev, amount: 400 }, W)).toBe(prev)
  })
})
