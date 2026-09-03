/**
 * Lote e parcelas: a contagem que decide o toast e se o diálogo do lote continua aberto.
 * Tudo aqui é função pura — o laço em si mora nos componentes (React), e o que se pode errar
 * sem perceber é a CONTAGEM: uma linha recusada por data fechada virar "falha genérica", ou
 * um lote sem nenhuma escrita fechar o diálogo e levar a seleção junto.
 */
import { describe, expect, it } from "vitest"

import {
  closedInstallments,
  summarizeBatch,
  type BatchRowResult,
} from "@/features/security/lib/batch-loops"

const rows = (...results: BatchRowResult[]) => summarizeBatch(results)

describe("summarizeBatch", () => {
  it("lote inteiro escrito: nada a avisar e o diálogo fecha", () => {
    expect(rows("succeeded", "succeeded", "succeeded")).toEqual({
      succeeded: 3,
      failed: 0,
      closed: 0,
      keepDialogOpen: false,
    })
  })

  it("linha em data fechada conta separado: não é falha genérica", () => {
    expect(rows("succeeded", "closed", "closed")).toEqual({
      succeeded: 1,
      failed: 0,
      closed: 2,
      keepDialogOpen: false,
    })
  })

  it("uma linha escrita já fecha o diálogo, mesmo com fechada e falha no meio", () => {
    expect(rows("failed", "closed", "succeeded")).toEqual({
      succeeded: 1,
      failed: 1,
      closed: 1,
      keepDialogOpen: false,
    })
  })

  it("nenhuma escrita: o diálogo fica aberto com a seleção intacta", () => {
    expect(rows("closed", "closed")).toMatchObject({ succeeded: 0, closed: 2, keepDialogOpen: true })
    expect(rows("failed", "closed")).toMatchObject({ succeeded: 0, failed: 1, keepDialogOpen: true })
    expect(rows("failed")).toMatchObject({ succeeded: 0, failed: 1, keepDialogOpen: true })
  })

  it("lote vazio não segura diálogo nenhum", () => {
    expect(rows()).toEqual({ succeeded: 0, failed: 0, closed: 0, keepDialogOpen: false })
  })
})

describe("closedInstallments", () => {
  const parcelas = ["2026-08-10", "2026-09-10", "2026-10-10"]

  it("sem corte, nenhuma parcela está fechada", () => {
    expect(closedInstallments(parcelas, null)).toEqual([])
  })

  it("corte antes de tudo não fecha parcela nenhuma", () => {
    expect(closedInstallments(parcelas, "2026-07-31")).toEqual([])
  })

  it("o próprio dia do corte está fechado", () => {
    expect(closedInstallments(parcelas, "2026-08-10")).toEqual(["2026-08-10"])
  })

  it("devolve as fechadas na ordem em que aparecem", () => {
    expect(closedInstallments(parcelas, "2026-09-30")).toEqual(["2026-08-10", "2026-09-10"])
  })

  it("dia repetido aparece uma vez só (a janela lista dias, não linhas)", () => {
    expect(closedInstallments(["2026-08-10", "2026-08-10"], "2026-08-31")).toEqual(["2026-08-10"])
  })

  it("instante ISO cai no dia UTC, igual ao que o banco guardaria", () => {
    expect(closedInstallments(["2026-08-10T12:00:00.000Z"], "2026-08-31")).toEqual(["2026-08-10"])
  })

  it("data ilegível é ignorada em vez de virar dia inventado", () => {
    expect(closedInstallments(["", "31/08/2026", "2026-13-40"], "2026-08-31")).toEqual([])
  })
})
