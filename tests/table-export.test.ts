import { describe, expect, it } from "vitest"
import {
  mergeColumnOrder,
  multiSelectFilter,
  toCsv,
  toJson,
  type ExportColumn,
} from "@/lib/table-export"

const cols: ExportColumn[] = [
  { id: "date", label: "Data" },
  { id: "note", label: "Nota" },
  { id: "amount", label: "Valor" },
]
const rows = [
  { date: "26/07/2026", note: 'Almoço, "restaurante"', amount: "R$ 45,00" },
  { date: "27/07/2026", note: "Linha 1\nLinha 2", amount: "-R$ 10,00" },
]

describe("toCsv", () => {
  it("começa com BOM UTF-8 e cabeçalho traduzido", () => {
    const csv = toCsv(cols, rows)
    expect(csv.startsWith("﻿")).toBe(true)
    expect(csv.split("\n")[0]).toBe("﻿Data,Nota,Valor")
  })
  it("escapa vírgula, aspas e quebra de linha", () => {
    const csv = toCsv(cols, rows)
    expect(csv).toContain('"Almoço, ""restaurante"""')
    expect(csv).toContain('"Linha 1\nLinha 2"')
  })
})

describe("toJson", () => {
  it("gera array de objetos chaveados por id de coluna", () => {
    const parsed = JSON.parse(toJson(cols, rows))
    expect(parsed).toHaveLength(2)
    expect(parsed[0]).toEqual(rows[0])
  })
})

describe("multiSelectFilter", () => {
  const rowStub = { getValue: () => "PAID" } as never
  it("passa quando o filtro está vazio ou não é array", () => {
    expect(multiSelectFilter(rowStub, "status", [], () => {})).toBe(true)
    expect(multiSelectFilter(rowStub, "status", undefined, () => {})).toBe(true)
  })
  it("filtra por inclusão no array", () => {
    expect(multiSelectFilter(rowStub, "status", ["PAID", "PENDING"], () => {})).toBe(true)
    expect(multiSelectFilter(rowStub, "status", ["OVERDUE"], () => {})).toBe(false)
  })
})

describe("mergeColumnOrder", () => {
  it("preserva ordem salva, descarta ids mortos e anexa ids novos na posição padrão", () => {
    const saved = ["date", "amount", "ghost", "note"]
    const current = ["select", "date", "note", "amount", "payee", "actions"]
    expect(mergeColumnOrder(saved, current)).toEqual([
      "select", "date", "amount", "note", "payee", "actions",
    ])
  })
})
