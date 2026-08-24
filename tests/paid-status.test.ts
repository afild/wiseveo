import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"
import {
  PAID_STATUS_NAMES,
  isPaidStatusName,
  paidStatusFilter,
  unpaidStatusFilter,
} from "../src/lib/paid-status"

/**
 * "Pago" tem UMA definição no sistema. Antes eram quatro listas diferentes, e o
 * mesmo lançamento aparecia como pago numa tela e agendado na outra — com o
 * agente perguntando aos mesmos serviços, isso viraria números contraditórios
 * dentro da MESMA resposta.
 */
describe("isPaidStatusName", () => {
  it("reconhece os nomes em português e inglês, em qualquer caixa", () => {
    for (const name of ["Pago", "PAGO", "paid", "Paid", "Paga", "Realizado", "Quitado"]) {
      expect(isPaidStatusName(name), name).toBe(true)
    }
  })

  it("tolera espaço nas pontas (o nome vem digitado por gente)", () => {
    expect(isPaidStatusName("  Pago ")).toBe(true)
    expect(isPaidStatusName("\tQuitado\n")).toBe(true)
  })

  it("não confunde com os outros status", () => {
    for (const name of ["Pendente", "Pending", "Vencido", "Overdue", "Agendado", "Scheduled", "Aberto"]) {
      expect(isPaidStatusName(name), name).toBe(false)
    }
  })

  it("vazio, nulo e indefinido não são pagos", () => {
    expect(isPaidStatusName("")).toBe(false)
    expect(isPaidStatusName(null)).toBe(false)
    expect(isPaidStatusName(undefined)).toBe(false)
  })
})

describe("filtros do Prisma", () => {
  it("o filtro de pago cobre todos os nomes, sem diferenciar caixa", () => {
    const filter = paidStatusFilter()
    expect(filter.OR).toHaveLength(PAID_STATUS_NAMES.length)
    for (const branch of filter.OR) {
      expect(branch.statusLookup.is.name.mode).toBe("insensitive")
    }
    expect(filter.OR.map((b) => b.statusLookup.is.name.equals).sort()).toEqual([...PAID_STATUS_NAMES].sort())
  })

  it("o filtro de não-pago é exatamente o oposto", () => {
    expect(unpaidStatusFilter()).toEqual({ NOT: paidStatusFilter() })
  })

  it("os dois lados concordam com a decisão em memória", () => {
    // O que o filtro do banco aceita é o que `isPaidStatusName` aceita.
    for (const name of PAID_STATUS_NAMES) {
      expect(isPaidStatusName(name), name).toBe(true)
    }
  })
})

describe("nenhuma lista paralela sobrou no código", () => {
  const readSrc = (relative: string) =>
    fs.readFileSync(path.resolve(__dirname, "..", relative), "utf8")

  // Os arquivos que tinham a própria lista: nenhum pode voltar a decidir sozinho.
  const sites = [
    "src/features/dashboard/services/get-latest-transactions.ts",
    "src/features/dashboard/services/get-upcoming-transactions.ts",
    "src/features/budget/services/get-budget-data.ts",
    "src/app/api/dashboard/expenses-by-group/route.ts",
    "src/features/transactions/services/get-transactions.ts",
    "src/features/calendar/services/get-calendar-statement.ts",
  ]

  it.each(sites)("%s usa o critério único, sem lista própria", (site) => {
    const source = readSrc(site)
    expect(source).toMatch(/@\/lib\/paid-status/)
    // "QUITADO"/"REALIZADO" só podem aparecer via o helper — nunca soltos aqui.
    expect(source).not.toMatch(/"QUITADO"|"REALIZADO"|'QUITADO'|'REALIZADO'/)
  })

  it("a definição dos insights só reexporta a única", () => {
    const source = readSrc("src/features/insights/services/paid-status.ts")
    expect(source).toMatch(/export \{[\s\S]*\} from "@\/lib\/paid-status"/)
  })
})
