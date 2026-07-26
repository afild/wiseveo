import type { FilterFn } from "@tanstack/react-table"

export interface ExportColumn {
  id: string
  label: string
}
export type ExportRow = Record<string, string>
export type ExportFormat = "csv" | "xlsx" | "json"

const CSV_BOM = "﻿"

function csvCell(value: string): string {
  return /[",\n;]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

export function toCsv(columns: ExportColumn[], rows: ExportRow[]): string {
  const header = columns.map((c) => csvCell(c.label)).join(",")
  const body = rows.map((r) => columns.map((c) => csvCell(r[c.id] ?? "")).join(","))
  return CSV_BOM + [header, ...body].join("\n")
}

export function toJson(columns: ExportColumn[], rows: ExportRow[]): string {
  return JSON.stringify(
    rows.map((r) => Object.fromEntries(columns.map((c) => [c.id, r[c.id] ?? ""]))),
    null,
    2
  )
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

/** Exporta no formato pedido. Excel entra por dynamic import (exceljs fora do bundle inicial). */
export async function exportRows(
  format: ExportFormat,
  opts: { columns: ExportColumn[]; rows: ExportRow[]; fileBaseName: string }
): Promise<void> {
  // Nome de arquivo é dado, não UI — sufixo ISO estável.
  const fileName = `${opts.fileBaseName}-${new Date().toISOString().slice(0, 10)}`
  if (format === "csv") {
    downloadBlob(
      new Blob([toCsv(opts.columns, opts.rows)], { type: "text/csv;charset=utf-8" }),
      `${fileName}.csv`
    )
    return
  }
  if (format === "json") {
    downloadBlob(
      new Blob([toJson(opts.columns, opts.rows)], { type: "application/json" }),
      `${fileName}.json`
    )
    return
  }
  // exceljs é CJS: dependendo do bundler o namespace chega direto ou embrulhado em `default`.
  const mod = await import("exceljs")
  const ExcelJS = mod.default ?? mod
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("Data")
  ws.columns = opts.columns.map((c) => ({
    header: c.label,
    key: c.id,
    width: Math.max(12, Math.min(40, c.label.length + 6)),
  }))
  ws.getRow(1).font = { bold: true }
  ws.addRows(opts.rows)
  const buffer = await wb.xlsx.writeBuffer()
  downloadBlob(
    new Blob([buffer as ArrayBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${fileName}.xlsx`
  )
}

/** filterFn para filtros facetados multi-seleção: valor da célula ∈ array do filtro. */
export const multiSelectFilter: FilterFn<unknown> = (row, columnId, filterValue) => {
  if (!Array.isArray(filterValue) || filterValue.length === 0) return true
  return filterValue.includes(String(row.getValue(columnId)))
}

/**
 * Reconciliação da ordem de colunas persistida com as colunas atuais.
 * Ids salvos que sumiram são descartados; ids novos (ou fixos) ficam na posição
 * que ocupam hoje e os salvos preenchem os slots restantes na ordem gravada.
 */
export function mergeColumnOrder(saved: string[], current: string[]): string[] {
  const valid = saved.filter((id) => current.includes(id))
  const merged: string[] = []
  let savedIdx = 0
  for (const id of current) {
    if (valid.includes(id)) {
      merged.push(valid[savedIdx])
      savedIdx += 1
    } else {
      merged.push(id)
    }
  }
  return merged
}
