import { describe, it, expect } from "vitest"
import {
  purgePersistedFilters,
  shouldPurgeKey,
  type KeyValueStorage,
} from "../src/lib/client-session-reset"

/**
 * Sessão nova no mesmo navegador (usuário DEMO recém-provisionado): apagam-se
 * períodos por rota (+ chave legada) e os filtros da tabela de transações que
 * escondem dados; layout de colunas, tema, moeda etc. ficam intactos.
 */
function fakeStorage(initial: Record<string, string>): KeyValueStorage & { snapshot(): string[] } {
  const map = new Map(Object.entries(initial))
  return {
    get length() {
      return map.size
    },
    key(index) {
      return Array.from(map.keys())[index] ?? null
    },
    removeItem(key) {
      map.delete(key)
    },
    snapshot() {
      return Array.from(map.keys()).sort()
    },
  }
}

describe("shouldPurgeKey", () => {
  it("apaga períodos por rota e a chave legada", () => {
    expect(shouldPurgeKey("wiseveo-date-filters")).toBe(true)
    expect(shouldPurgeKey("wiseveo-date-filters:%2Fdashboard")).toBe(true)
    expect(shouldPurgeKey("wiseveo-date-filters:%2Ftransactions")).toBe(true)
  })

  it("apaga busca livre e filtros das tabelas de transações e recorrentes", () => {
    expect(shouldPurgeKey("wiseveo-table-global-filter")).toBe(true)
    expect(shouldPurgeKey("wiseveo-table-filters-v2")).toBe(true)
    expect(shouldPurgeKey("wiseveo-recurring-filters-v2")).toBe(true)
  })

  it("apaga o cache local da moeda (o servidor é a fonte; demo novo nasce em USD)", () => {
    expect(shouldPurgeKey("wiseveo-monetary-preferences")).toBe(true)
  })

  it("preserva layout, tema e chaves parecidas", () => {
    for (const key of [
      "wiseveo-table-visibility",
      "wiseveo-table-sizing",
      "wiseveo-table-order",
      "wiseveo-recurring-sorting",
      "wiseveo-recurring-visibility",
      "wiseveo-theme-preferences",
      "wiseveo-theme",
      "wiseveo-date-filters-other", // prefixo parecido, sem os dois-pontos
    ]) {
      expect(shouldPurgeKey(key)).toBe(false)
    }
  })
})

describe("purgePersistedFilters", () => {
  it("remove só as chaves certas e devolve a lista removida", () => {
    const storage = fakeStorage({
      "wiseveo-date-filters": "{}",
      "wiseveo-date-filters:%2Fdashboard": "{}",
      "wiseveo-date-filters:%2Ftransactions": "{}",
      "wiseveo-table-global-filter": "03/2026",
      "wiseveo-table-filters-v2": "[]",
      "wiseveo-recurring-filters-v2": "[]",
      "wiseveo-monetary-preferences": "{\"currency\":\"EUR\"}",
      "wiseveo-table-visibility": "{}",
      "wiseveo-theme-preferences": "{}",
    })

    const removed = purgePersistedFilters(storage).sort()

    expect(removed).toEqual([
      "wiseveo-date-filters",
      "wiseveo-date-filters:%2Fdashboard",
      "wiseveo-date-filters:%2Ftransactions",
      "wiseveo-monetary-preferences",
      "wiseveo-recurring-filters-v2",
      "wiseveo-table-filters-v2",
      "wiseveo-table-global-filter",
    ])
    expect(storage.snapshot()).toEqual(["wiseveo-table-visibility", "wiseveo-theme-preferences"])
  })

  it("é seguro num storage vazio", () => {
    expect(purgePersistedFilters(fakeStorage({}))).toEqual([])
  })
})
