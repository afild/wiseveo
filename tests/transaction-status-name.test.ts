import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { normalizeStatusName } from "../src/lib/paid-status"
import { resolveStatusLabel, type Translate } from "../src/i18n/chart-labels"

/**
 * O código do status é só chave estrangeira. O banco do dono amarra 1 PAGO,
 * 2 ABERTO, 3 PENDENTE, 4 VENCIDO; o seed atual amarra 1 Paid, 2 Pending,
 * 3 Overdue, 4 Scheduled. Rotular pelo código mostrava "Vencido" no formulário
 * para um status que a tabela (pelo nome) exibia como "Pendente". O significado
 * vem SEMPRE do nome, e o rótulo segue o significado.
 */
describe("normalizeStatusName", () => {
  it("reconhece os nomes do banco do dono (português, maiúsculas)", () => {
    expect(normalizeStatusName("PAGO")).toBe("PAID")
    expect(normalizeStatusName("ABERTO")).toBe("SCHEDULED")
    expect(normalizeStatusName("PENDENTE")).toBe("PENDING")
    expect(normalizeStatusName("VENCIDO")).toBe("OVERDUE")
  })

  it("reconhece os nomes do seed (inglês, capitalizados)", () => {
    expect(normalizeStatusName("Paid")).toBe("PAID")
    expect(normalizeStatusName("Pending")).toBe("PENDING")
    expect(normalizeStatusName("Overdue")).toBe("OVERDUE")
    expect(normalizeStatusName("Scheduled")).toBe("SCHEDULED")
  })

  it("segue o critério único de pago e aceita AGENDADO como agendado", () => {
    for (const name of ["Paga", "Realizado", "Quitado"]) {
      expect(normalizeStatusName(name), name).toBe("PAID")
    }
    expect(normalizeStatusName("Agendado")).toBe("SCHEDULED")
  })

  it("tolera caixa e espaço nas pontas", () => {
    expect(normalizeStatusName("  vencido ")).toBe("OVERDUE")
    expect(normalizeStatusName("\tpendente\n")).toBe("PENDING")
  })

  it("nome desconhecido, vazio, nulo e indefinido dão null (quem chama decide o fallback)", () => {
    expect(normalizeStatusName("Foo")).toBeNull()
    expect(normalizeStatusName("")).toBeNull()
    expect(normalizeStatusName("   ")).toBeNull()
    expect(normalizeStatusName(null)).toBeNull()
    expect(normalizeStatusName(undefined)).toBeNull()
  })
})

describe("resolveStatusLabel", () => {
  const messages = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "..", "src/i18n/messages/pt-BR.json"), "utf8"),
  ) as Record<string, unknown>

  // `t` de mentira: resolve a chave pontuada direto no pt-BR.json, como o next-intl faria.
  const t = ((key: string) => {
    const value = key.split(".").reduce<unknown>((node, part) => {
      if (node && typeof node === "object") return (node as Record<string, unknown>)[part]
      return undefined
    }, messages)
    if (typeof value !== "string") throw new Error(`chave sem tradução: ${key}`)
    return value
  }) as unknown as Translate

  it("rotula pelo NOME no catálogo do dono, ignorando o código", () => {
    expect(resolveStatusLabel(t, { code: 3, name: "PENDENTE" })).toBe("Pendente")
    expect(resolveStatusLabel(t, { code: 4, name: "VENCIDO" })).toBe("Vencido")
    expect(resolveStatusLabel(t, { code: 2, name: "ABERTO" })).toBe("Agendado")
    expect(resolveStatusLabel(t, { code: 1, name: "PAGO" })).toBe("Pago")
  })

  it("rotula pelo NOME no catálogo do seed", () => {
    expect(resolveStatusLabel(t, { code: 3, name: "Overdue" })).toBe("Vencido")
    expect(resolveStatusLabel(t, { code: 1, name: "Paid" })).toBe("Pago")
    expect(resolveStatusLabel(t, { code: 2, name: "Pending" })).toBe("Pendente")
    expect(resolveStatusLabel(t, { code: 4, name: "Scheduled" })).toBe("Agendado")
  })

  it("nome desconhecido volta como está no banco, sem inventar significado", () => {
    expect(resolveStatusLabel(t, { code: 9, name: "Foo" })).toBe("Foo")
  })

  it("as chaves semânticas existem nos três idiomas", () => {
    for (const locale of ["pt-BR", "en-US", "es-419"]) {
      const file = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, "..", `src/i18n/messages/${locale}.json`), "utf8"),
      ) as { chartOfAccounts: { statuses: Record<string, string> } }
      expect(Object.keys(file.chartOfAccounts.statuses), locale).toEqual([
        "overdue",
        "paid",
        "pending",
        "scheduled",
      ])
    }
  })
})
