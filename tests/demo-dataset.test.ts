import { describe, it, expect } from "vitest"
import { getDemoDataset, GROUPS_EXPENSE_RANGES, FIXED_CUTOFF } from "../src/lib/demo-data/generate-demo-dataset"

const ds = getDemoDataset() // memoizado, semente fixa

const isWeekend = (d: Date) => [0, 6].includes(d.getUTCDay())
const cents = (v: number) => Math.round(Math.abs(v) * 100) % 100

describe("P1/P3 — totais mensais e arredondamento", () => {
  it("entradas 13500–15500, saídas 12500–16500 em todos os 36 meses", () => {
    for (const m of ds.months) {
      expect(m.income, m.label).toBeGreaterThanOrEqual(13500)
      expect(m.income, m.label).toBeLessThanOrEqual(15500)
      expect(m.expense, m.label).toBeGreaterThanOrEqual(12500)
      expect(m.expense, m.label).toBeLessThanOrEqual(16500)
    }
  })
  it("salário e freelance redondos; despesas nunca em ,00", () => {
    for (const t of ds.transactions) {
      if (t.kind === "salary" || t.kind === "freelance") expect(cents(t.amount)).toBe(0)
      if (t.type === "EXPENSE") expect(cents(t.amount), `${t.description} ${t.amount}`).not.toBe(0)
    }
  })
})

describe("P4 — contas fixas: mesmo dia, mesmo valor dentro do ano (utilities: dia fixo, valor sazonal — D4)", () => {
  it("cada conta fixa aparece 12x/ano com valor e dia constantes", () => {
    for (const bill of ds.catalog.fixedBills) {
      for (const year of [2025, 2026, 2027]) {
        const occ = ds.transactions.filter(
          (t) => t.payee === bill.payee && t.description === bill.description && t.date.getUTCFullYear() === year
        )
        expect(occ.length, `${bill.description}/${year}`).toBe(12)
        expect(new Set(occ.map((t) => t.amount)).size).toBe(1)
        expect(new Set(occ.map((t) => t.date.getUTCDate())).size).toBe(1)
      }
    }
  })
  it("utilities: 12x/ano, dia constante, valor dentro de base×[0.7, 1.5]", () => {
    for (const u of ds.catalog.seasonalUtilities) {
      for (const year of [2025, 2026, 2027]) {
        const occ = ds.transactions.filter(
          (t) => t.payee === u.payee && t.date.getUTCFullYear() === year
        )
        expect(occ.length, `${u.description}/${year}`).toBe(12)
        expect(new Set(occ.map((t) => t.date.getUTCDate())).size).toBe(1)
        for (const t of occ) {
          expect(Math.abs(t.amount)).toBeGreaterThanOrEqual(u.values[year] * 0.7)
          expect(Math.abs(t.amount)).toBeLessThanOrEqual(u.values[year] * 1.5)
        }
      }
    }
  })
})

describe("P5/P6/P7 — faixas % por grupo", () => {
  it("todo grupo dentro da faixa em todos os meses", () => {
    for (const m of ds.months) {
      for (const [g, [lo, hi]] of Object.entries(GROUPS_EXPENSE_RANGES)) {
        const pct = ((m.byGroup[+g] ?? 0) / m.income) * 100
        expect(pct, `${m.label} grupo ${g}`).toBeGreaterThanOrEqual(lo)
        expect(pct, `${m.label} grupo ${g}`).toBeLessThanOrEqual(hi)
      }
    }
  })
  it("eventos sazonais presentes (calendário EUA — D6)", () => {
    const has = (desc: string, y: number, mo: number) =>
      ds.transactions.some((t) => t.description === desc && t.date.getUTCFullYear() === y && t.date.getUTCMonth() === mo)
    for (const y of [2025, 2026, 2027]) {
      expect(has("Vacation Package", y, 6), `vacation ${y}`).toBe(true)
      expect(has("Christmas Gifts", y, 11), `gifts ${y}`).toBe(true)
      expect(has("Vehicle Registration Renewal", y, 2), `dmv ${y}`).toBe(true)
      expect(has("Tax Preparation Service", y, 3), `tax prep ${y}`).toBe(true)
      expect(has("Black Friday Electronics Deal", y, 10), `black friday ${y}`).toBe(true)
      expect(has("Medicines", y, 0), `flu season ${y}`).toBe(true)
    }
  })
})

describe("P8/P11 — cobertura e acumulado", () => {
  it("36 meses, de jan/2025 a dez/2027", () => {
    expect(ds.months.length).toBe(36)
    const dates = ds.transactions.map((t) => t.date.getTime())
    expect(new Date(Math.min(...dates)).getUTCFullYear()).toBe(2025)
    expect(new Date(Math.max(...dates)).toISOString().slice(0, 7)).toBe("2027-12")
  })
  it("acumulado (base 973) nunca negativo; sobra média 50–200", () => {
    let cum = 973
    let sum = 0
    for (const m of ds.months) {
      cum += m.delta
      sum += m.delta
      expect(cum, m.label).toBeGreaterThanOrEqual(0)
    }
    const avg = sum / ds.months.length
    expect(avg).toBeGreaterThanOrEqual(50)
    expect(avg).toBeLessThanOrEqual(200)
  })
})

describe("P12 — cadência diária", () => {
  it("dias úteis 1–5 lançamentos; nenhum dia > 5; ≥72% em dias úteis", () => {
    const perDay = new Map<string, number>()
    let weekday = 0
    for (const t of ds.transactions) {
      const k = t.date.toISOString().slice(0, 10)
      perDay.set(k, (perDay.get(k) ?? 0) + 1)
      if (!isWeekend(t.date)) weekday++
    }
    for (let d = new Date(Date.UTC(2025, 0, 1)); d <= new Date(Date.UTC(2027, 11, 31)); d = new Date(d.getTime() + 86400000)) {
      const n = perDay.get(d.toISOString().slice(0, 10)) ?? 0
      expect(n, d.toISOString()).toBeLessThanOrEqual(5)
      if (!isWeekend(d)) expect(n, d.toISOString()).toBeGreaterThanOrEqual(1)
    }
    expect(weekday / ds.transactions.length).toBeGreaterThanOrEqual(0.72)
  })
})

describe("P9/P10 — corte e catálogo fechado", () => {
  it("pago até o corte, aberto depois (statuses abstratos)", () => {
    for (const t of ds.transactions) {
      if (t.date <= FIXED_CUTOFF) expect(t.paid, t.date.toISOString()).toBe(true)
      else expect(t.paid).toBe(false)
    }
  })
  it("todo payee/descrição vem do catálogo fechado (nada fora da lista)", () => {
    const names = new Set(ds.catalog.allPayees)
    for (const t of ds.transactions) expect(names.has(t.payee), t.payee).toBe(true)
  })
})
