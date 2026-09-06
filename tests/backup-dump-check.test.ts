import { describe, expect, it } from "vitest"
import { checkDumpToc } from "../src/features/backup/lib/dump-check"

const line = (n: number, kind: string, name: string) => `${n}; 0 0 ${kind} public ${name} postgres`
const goodToc = [";", "; Archive created at 2026-09-05", ...Array.from({ length: 160 }, (_, i) => line(i + 1, i % 2 ? "TABLE" : "INDEX", `obj${i}`)), line(999, "TABLE DATA", "transactions")].join("\n")

describe("checkDumpToc", () => {
  it("aceita índice com objetos suficientes, os lançamentos e tamanho mínimo", () => {
    expect(checkDumpToc(goodToc, 250_000)).toEqual({ ok: true, objects: 161 })
  })
  it("recusa índice curto (dump pela metade)", () => {
    const short = goodToc.split("\n").slice(0, 40).join("\n")
    expect(checkDumpToc(short, 250_000)).toEqual({ ok: false, reason: "tooFewObjects" })
  })
  it("recusa dump sem os dados de transactions", () => {
    const noData = goodToc.replace("TABLE DATA public transactions", "TABLE DATA public payees")
    expect(checkDumpToc(noData, 250_000)).toEqual({ ok: false, reason: "noTransactions" })
  })
  it("recusa arquivo pequeno demais", () => {
    expect(checkDumpToc(goodToc, 10_000)).toEqual({ ok: false, reason: "tooSmall" })
  })
})
