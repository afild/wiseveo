import { readFileSync } from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { dayKeyOfLocal } from "@/features/security/lib/date-closing"

/**
 * "Hoje" das telas é o hoje de QUEM OLHA, não o de Greenwich.
 *
 * O dono mora em Orlando (UTC-4 no verão, UTC-5 no inverno). Depois das 20h de lá já é o dia
 * seguinte em UTC, então `new Date().toISOString().split("T")[0]` — o jeito antigo — devolvia
 * AMANHÃ nos seletores de data: um lançamento feito às 23h nascia com a data do dia seguinte,
 * e no fechamento de datas isso é grave, porque muda o lado do corte em que a linha cai.
 *
 * O relógio destes testes é fixado às 23h30 de 01/09/2026 no fuso da Flórida, o momento exato
 * em que os dois jeitos discordam. O fuso do processo é fixado em `vitest.config.ts`
 * (`TZ: "America/New_York"`); sem isso a máquina de CI rodaria em UTC e o teste passaria sem
 * provar nada.
 */
const MOMENTO = new Date("2026-09-01T23:30:00-04:00")

describe("hoje local nos seletores de data", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(MOMENTO)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("o fuso do processo não é UTC, senão nada aqui prova nada", () => {
    expect(process.env.TZ).toBe("America/New_York")
    expect(new Date().getTimezoneOffset()).not.toBe(0)
  })

  it("devolve o dia de quem olha, não o de Greenwich", () => {
    expect(dayKeyOfLocal(new Date())).toBe("2026-09-01")
  })

  it("o jeito antigo devolveria amanhã — é essa a diferença que o teste guarda", () => {
    expect(new Date().toISOString().split("T")[0]).toBe("2026-09-02")
  })

  it("uma data local qualquer vira a própria chave, sem passear por UTC", () => {
    expect(dayKeyOfLocal(new Date(2026, 8, 1, 23, 30))).toBe("2026-09-01")
    expect(dayKeyOfLocal(new Date(2026, 0, 31, 20, 0))).toBe("2026-01-31")
  })
})

/**
 * Catraca de código: as telas de lançamentos e de recorrentes não podem voltar a derivar "hoje"
 * (nem a data de uma parcela) de `toISOString()`. A agulha é montada por PARTES para a varredura
 * não se achar quando o padrão proibido for citado num comentário ou neste próprio arquivo.
 */
const RAIZ = path.resolve(__dirname, "..", "..", "src", "features")
const ARQUIVOS = [
  "transactions/hooks/use-transaction-form.ts",
  "transactions/components/transaction-batch-actions.tsx",
  "transactions/components/columns.tsx",
  "transactions/components/new-transaction-dialog.tsx",
  "recurring/components/recurring-client.tsx",
  "recurring/components/data-table-toolbar.tsx",
]
const AGULHAS = ["split", "slice", "substring"].map((corte) => "toISOString()." + corte)
const derivaDiaDeIso = (texto: string) => AGULHAS.some((agulha) => texto.includes(agulha))

describe("catraca do hoje local", () => {
  it.each(ARQUIVOS)("%s não deriva dia de toISOString", (relativo) => {
    const conteudo = readFileSync(path.join(RAIZ, relativo), "utf8")
    expect(derivaDiaDeIso(conteudo)).toBe(false)
  })

  it("a agulha acha de verdade quando o padrão está lá", () => {
    expect(derivaDiaDeIso('const hoje = new Date().toISOString().split("T")[0]')).toBe(true)
    expect(derivaDiaDeIso("const dia = agora.toISOString().slice(0, 10)")).toBe(true)
    expect(derivaDiaDeIso("const hoje = dayKeyOfLocal(new Date())")).toBe(false)
  })
})
