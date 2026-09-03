/**
 * Lote e parcelas: a contagem PURA (sem React, sem fetch).
 *
 * O laço em si (pagar, mudar data, copiar, excluir, lançar recorrente, criar parcelas) mora nos
 * componentes; aqui fica só o que decide o que a pessoa lê no fim e se o diálogo do lote continua
 * aberto. Uma linha recusada por data fechada (423) NÃO é falha genérica: vira `closed`, para o
 * aviso poder dizer quantas estavam em data fechada em vez de um "falhou" que não explica nada.
 */
import { isDayClosed, isDayKey } from "./date-closing"

/** Como cada linha do lote terminou. */
export type BatchRowResult = "succeeded" | "closed" | "failed"

export interface BatchSummary {
  succeeded: number
  failed: number
  /** Linhas que voltaram 423 (data fechada). */
  closed: number
  /**
   * Nada foi escrito: o diálogo do lote fica aberto com a seleção intacta, para a pessoa
   * poder corrigir a data e tentar de novo sem remarcar as linhas uma a uma.
   */
  keepDialogOpen: boolean
}

export function summarizeBatch(results: BatchRowResult[]): BatchSummary {
  let succeeded = 0
  let failed = 0
  let closed = 0
  for (const result of results) {
    if (result === "succeeded") succeeded += 1
    else if (result === "closed") closed += 1
    else failed += 1
  }
  return { succeeded, failed, closed, keepDialogOpen: results.length > 0 && succeeded === 0 }
}

/**
 * Dias fechados entre as datas das parcelas, na ordem em que aparecem e sem repetir (a janela do
 * PIN lista DIAS, não linhas). Data ilegível é ignorada em vez de virar dia inventado na janela;
 * a trava de verdade continua sendo a do servidor, que responde 423.
 */
export function closedInstallments(dates: string[], closedThrough: string | null): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of dates) {
    // Um instante ISO completo cai no dia UTC, exatamente o dia que `normalizeDate` gravaria.
    const day = typeof value === "string" ? value.slice(0, 10) : ""
    if (!isDayKey(day) || !isDayClosed(day, closedThrough) || seen.has(day)) continue
    seen.add(day)
    out.push(day)
  }
  return out
}
