"use client"

// WISEVEO — Tabela que cabe no contêiner ("fill to container").
//
// Antes, cada coluna tinha largura fixa em px (150 por padrão) e a tabela media a SOMA
// das colunas: com 13 colunas ela passava de 2.000px e a rolagem horizontal aparecia
// mesmo em tela larga. Agora as larguras salvas viram PESOS: mede-se o contêiner e os
// pixels são distribuídos entre as colunas redimensionáveis na proporção dos pesos, com
// piso em `minSize`; seleção e ações (não redimensionáveis) mantêm o tamanho fixo.
//
// Invariante que simplifica tudo: FORA de um arraste, o estado `columnSizing` das colunas
// visíveis é mantido igual aos px na tela (o componente aplica `normalizedSizing` durante
// o render). Assim o TanStack captura `startSize` já em px e entrega, a cada mousemove,
// a largura-alvo ABSOLUTA da coluna; o teclado (±16) idem. Sem isso o TanStack limitaria
// o encolhimento ao peso salvo (piso de -99,9999% relativo ao startSize), e um retrato do
// início do arraste seria necessário — frágil (um mousemove sem mudança de X o apagava).
//
// Redimensionar é o gesto de planilha: arrastar a borda de uma coluna dá/tira largura da
// vizinha à direita, o total não muda e a borda acompanha o mouse 1:1.

import * as React from "react"
import type { Column, ColumnSizingState, Table } from "@tanstack/react-table"

export const DEFAULT_MIN_SIZE = 64
export const DEFAULT_SIZE = 150

type AnyColumn<T> = Column<T, unknown>

function minSizeOf<T>(column: AnyColumn<T>): number {
  return column.columnDef.minSize ?? DEFAULT_MIN_SIZE
}

/** Peso atual da coluna: estado salvo ou tamanho padrão da definição, nunca abaixo do mínimo. */
function weightOf<T>(column: AnyColumn<T>, sizing: ColumnSizingState): number {
  const raw = sizing[column.id] ?? column.columnDef.size ?? DEFAULT_SIZE
  return Math.max(minSizeOf(column), raw)
}

/**
 * Largura interna do contêiner (px inteiros, arredondados PARA BAIXO), viva via
 * ResizeObserver. Devolve `[ref, width]`; `width` é 0 no servidor e no primeiro render do
 * cliente (o elemento ainda não montou), o que mantém a hidratação idêntica nos dois lados.
 * Mede o primeiro filho (o wrapper do <Table>, sem borda nem padding) em vez de
 * `clientWidth`, que já vem arredondado e em zoom/HiDPI pode passar da largura real por
 * meio pixel — e a soma das colunas nunca pode passar da largura real. useSyncExternalStore
 * dispensa setState em efeito.
 */
export function useContainerWidth(): [(element: HTMLElement | null) => void, number] {
  const [element, setElement] = React.useState<HTMLElement | null>(null)

  const subscribe = React.useCallback(
    (onChange: () => void) => {
      if (!element) return () => {}
      const observer = new ResizeObserver(() => onChange())
      observer.observe(element)
      return () => observer.disconnect()
    },
    [element],
  )

  const getSnapshot = React.useCallback(() => {
    if (!element) return 0
    const target = element.firstElementChild ?? element
    return Math.max(0, Math.floor(target.getBoundingClientRect().width))
  }, [element])

  const width = React.useSyncExternalStore(subscribe, getSnapshot, () => 0)
  return [setElement, width]
}

/**
 * Distribui `containerWidth` entre as colunas visíveis: as não redimensionáveis ficam com
 * o próprio tamanho; as demais dividem o resto na proporção dos pesos, com piso em
 * `minSize` (quem cairia abaixo do piso é "pinado" e o resto é redistribuído — converge
 * em no máximo n passos). Se a soma dos mínimos não cabe, a tabela fica na soma dos
 * mínimos e o contêiner rola. Larguras inteiras cuja soma é EXATAMENTE a largura
 * disponível (o resto do floor vai para os maiores restos): sem sobra que role e sem
 * oscilação ao normalizar de novo (distribuir o resultado devolve o próprio resultado).
 */
export function distributeWidths<T>(
  table: Table<T>,
  sizing: ColumnSizingState,
  containerWidth: number,
): Record<string, number> {
  const columns = table.getVisibleLeafColumns()
  const widths: Record<string, number> = {}
  const flexible: AnyColumn<T>[] = []
  let fixedTotal = 0

  for (const column of columns) {
    if (column.getCanResize()) {
      flexible.push(column)
    } else {
      widths[column.id] = weightOf(column, sizing)
      fixedTotal += widths[column.id]
    }
  }

  const minTotal = fixedTotal + flexible.reduce((sum, c) => sum + minSizeOf(c), 0)
  let remaining = Math.max(containerWidth, minTotal) - fixedTotal
  let pool = flexible
  let weightTotal = pool.reduce((sum, c) => sum + weightOf(c, sizing), 0)

  for (;;) {
    const pinned = pool.find(
      (c) => (remaining * weightOf(c, sizing)) / weightTotal < minSizeOf(c),
    )
    if (!pinned) break
    widths[pinned.id] = minSizeOf(pinned)
    remaining -= minSizeOf(pinned)
    weightTotal -= weightOf(pinned, sizing)
    pool = pool.filter((c) => c !== pinned)
  }

  const shares = pool.map((c) => (remaining * weightOf(c, sizing)) / weightTotal)
  let leftover = remaining
  pool.forEach((c, i) => {
    widths[c.id] = Math.floor(shares[i])
    leftover -= widths[c.id]
  })
  // Resto do floor (< n px) para as colunas de maior parte fracionária.
  const byRemainder = pool
    .map((c, i) => ({ c, frac: shares[i] - Math.floor(shares[i]) }))
    .sort((a, b) => b.frac - a.frac)
  for (let i = 0; i < leftover && i < byRemainder.length; i++) {
    widths[byRemainder[i].c.id] += 1
  }

  return widths
}

/** Soma dos mínimos das colunas visíveis (fixas contam o próprio tamanho). */
export function minTableWidth<T>(table: Table<T>, sizing: ColumnSizingState): number {
  return table
    .getVisibleLeafColumns()
    .reduce(
      (sum, c) => sum + (c.getCanResize() ? minSizeOf(c) : weightOf(c, sizing)),
      0,
    )
}

/**
 * Coluna com alça de redimensionar: precisa ser redimensionável E ter alguma coluna
 * redimensionável à direita para ceder/receber largura. A última flexível não tem alça
 * (a borda dela é o fim da tabela); ajusta-se pela vizinha à esquerda.
 */
export function canResizeColumn<T>(table: Table<T>, columnId: string): boolean {
  const columns = table.getVisibleLeafColumns()
  const index = columns.findIndex((c) => c.id === columnId)
  if (index === -1 || !columns[index].getCanResize()) return false
  return columns.slice(index + 1).some((c) => c.getCanResize())
}

function changedKeys(prev: ColumnSizingState, next: ColumnSizingState): string[] {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)])
  return Array.from(keys).filter((key) => prev[key] !== next[key])
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

/**
 * Wrapper de `onColumnSizingChange`: transforma a mudança bruta do TanStack (só a coluna
 * mexida muda) em "coluna cresce, vizinha à direita encolhe", em px de tela.
 * Com o estado normalizado (pesos = px), o valor recebido é a largura-alvo ABSOLUTA da
 * coluna — tanto no arraste (startSize + delta do mouse) quanto no teclado (±16); reset
 * (chave removida) volta ao tamanho padrão da coluna. Devolve o estado normalizado das
 * colunas visíveis; as ocultas mantêm o peso antigo. Mudança vazia (mousemove sem
 * variação de X) não altera nada; mudanças em várias chaves passam intactas.
 */
export function applyFittedResize<T>(
  table: Table<T>,
  prev: ColumnSizingState,
  next: ColumnSizingState,
  containerWidth: number,
): ColumnSizingState {
  const changed = changedKeys(prev, next)
  if (changed.length === 0) return prev
  if (changed.length > 1) return next

  const [columnId] = changed
  const columns = table.getVisibleLeafColumns()
  const index = columns.findIndex((c) => c.id === columnId)
  const column = columns[index]
  if (!column || !column.getCanResize()) return next

  const neighbor = columns.slice(index + 1).find((c) => c.getCanResize())
  if (!neighbor) return prev // sem alça: nada a ceder

  const base = distributeWidths(table, prev, containerWidth)
  const rawNext = next[columnId]
  const target = rawNext === undefined ? (column.columnDef.size ?? DEFAULT_SIZE) : rawNext

  const minA = minSizeOf(column)
  const maxA = base[columnId] + (base[neighbor.id] - minSizeOf(neighbor))
  const a = Math.round(clamp(target, minA, maxA))
  const b = base[neighbor.id] - (a - base[columnId])

  return { ...prev, ...base, [columnId]: a, [neighbor.id]: b }
}

/**
 * Larguras para o render: px após a medição; antes dela, % do total (igual no SSR).
 * `normalizedSizing` vem preenchido quando o estado das colunas visíveis difere dos px
 * na tela (carga do storage, largura do contêiner mudou, coluna oculta/mostrada) e não há
 * arraste em curso: o componente o aplica com setState DURANTE o render (padrão de estado
 * derivado do React; o React re-renderiza na hora e o resultado é estável, pois distribuir
 * o próprio resultado devolve o mesmo mapa).
 */
export function getFittedColumnLayout<T>(table: Table<T>, containerWidth: number) {
  const sizing = table.getState().columnSizing
  const widths = containerWidth > 0 ? distributeWidths(table, sizing, containerWidth) : null
  const total = table.getVisibleLeafColumns().reduce((sum, c) => sum + c.getSize(), 0)
  const resizing = Boolean(table.getState().columnSizingInfo?.isResizingColumn)

  let normalizedSizing: ColumnSizingState | null = null
  if (widths && !resizing) {
    const drifted = table
      .getVisibleLeafColumns()
      .some((c) => c.getCanResize() && sizing[c.id] !== widths[c.id])
    if (drifted) normalizedSizing = { ...sizing, ...widths }
  }

  return {
    tableMinWidth: minTableWidth(table, sizing),
    normalizedSizing,
    widthFor(columnId: string): number | string {
      if (widths) return widths[columnId]
      const column = table.getColumn(columnId)
      return column ? `${(column.getSize() / total) * 100}%` : "auto"
    },
    canResize(columnId: string): boolean {
      return canResizeColumn(table, columnId)
    },
  }
}
