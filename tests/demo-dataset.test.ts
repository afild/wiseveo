import { describe, it, expect } from "vitest"
import { getDemoDataset, GROUPS_EXPENSE_RANGES, FIXED_CUTOFF } from "../src/lib/demo-data/generate-demo-dataset"
import { materializeDataset } from "../src/lib/demo-data/materialize"

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

describe("amostra aprovada", () => {
  it("bate com a amostra aprovada (semente 20260726, contexto EUA)", () => {
    expect(ds.transactions.length).toBe(2541)
    const avg = ds.months.reduce((a, b) => a + b.delta, 0) / 36
    expect(avg).toBeCloseTo(109.34, 1)
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

describe("Recorrentes e budgets", () => {
  // Nota: o plano descrevia "16 templates a partir de FIXED_BILLS" + salário = 17,
  // mas FIXED_BILLS tem 14 entradas e SEASONAL_UTILITY_BILLS tem 3 — 14+3+1 = 18.
  // Decisão registrada no relatório da Tarefa 4: incluir todas as 17 contas recorrentes
  // reais (14 fixas + 3 utilities) + 1 salário = 18, para não faltar nenhuma conta real
  // na tela de Recorrentes da demo. O "17" do plano era uma contagem equivocada do catálogo.
  it("um template recorrente por conta fixa + utility sazonal + salário (18), statusCode certo", () => {
    expect(ds.recurringTemplates.length).toBe(18)
    const salary = ds.recurringTemplates.find((r) => r.kind === "salary")!
    expect(salary.amount).toBeGreaterThan(0)
    expect(salary.statusCode).toBe(1)
    for (const r of ds.recurringTemplates.filter((r) => r.kind !== "salary")) {
      expect(r.amount).toBeLessThan(0)
      expect(r.statusCode).toBe(2)
      expect(r.period).toBe("202607")
    }
  })
  it("um budget por grupo de despesa, teto ≈ topo da faixa", () => {
    expect(ds.budgets.length).toBe(7)
    for (const b of ds.budgets) {
      const [, hi] = GROUPS_EXPENSE_RANGES[b.group]
      expect(b.amount).toBeGreaterThan(0)
      expect(b.amount).toBeLessThanOrEqual(((hi + 1) / 100) * 15500)
    }
  })
})

describe("P13 — materialização isolada", () => {
  // Desvio documentado (A): CUTOFF_MODE é "dynamic" e o materializador usa
  // cutoff = now − 24h. Para o corte cair EXATAMENTE em FIXED_CUTOFF (27/07/2026 12:00),
  // o teste pina now em 28/07/2026 12:00 — é o "os testes pinam 27/07/2026" da decisão D1.
  const rows = materializeDataset(getDemoDataset(), {
    userId: "demo_test", prefix: "ab12cd34",
    accountIds: { CHECKING: 1_500_100, SAVINGS: 1_500_101, WALLET: 1_500_102 },
    groupUuidByCode: { 100: "u100", 200: "u200", 300: "u300", 400: "u400", 500: "u500", 600: "u600", 700: "u700", 800: "u800", 900: "u900" },
    groupCodeOffset: 1_500_100 - 100, // phantomCode = offset + originalCode
    payeeIdBase: 5_000_000,
    now: new Date(Date.UTC(2026, 6, 28, 12, 0, 0)),
  })
  it("todos os codes prefixados/deslocados — nunca os globais", () => {
    for (const t of rows.transactions) {
      expect(t.categoryCode.startsWith("ab12cd34.")).toBe(true)
      expect(t.groupCode).toBeGreaterThan(1_000_000)
      expect([1_500_100, 1_500_101, 1_500_102]).toContain(t.accountId)
      expect(t.userId).toBe("demo_test")
    }
  })
  it("statusCode: 1 até o corte, 2 depois, ≤2 vencidos(3) pequenos", () => {
    const overdue = rows.transactions.filter((t) => t.statusCode === 3)
    expect(overdue.length).toBeLessThanOrEqual(2)
    for (const o of overdue) expect(Math.abs(o.amount)).toBeLessThanOrEqual(300)
    for (const t of rows.transactions) {
      if (t.statusCode !== 3) expect(t.statusCode).toBe(t.date <= FIXED_CUTOFF ? 1 : 2)
    }
  })
  it("num sequencial cronológico a partir de 1; period = YYYYMM da data", () => {
    rows.transactions.forEach((t, i) => {
      expect(t.num).toBe(i + 1)
      const p = `${t.date.getUTCFullYear()}${String(t.date.getUTCMonth() + 1).padStart(2, "0")}`
      expect(t.period).toBe(p)
    })
  })
  it("payee ids no bloco reservado, um id por nome", () => {
    const ids = rows.payees.map((p) => p.id)
    expect(Math.min(...ids)).toBe(5_000_000)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it("P14 — todas as colunas preenchidas em TODOS os lançamentos", () => {
    for (const t of rows.transactions) {
      expect(t.num, "NUM").toBeGreaterThan(0)
      expect(t.period, "PERÍODO").toMatch(/^\d{6}$/)
      expect(t.date instanceof Date && !isNaN(t.date.getTime()), "DATA").toBe(true)
      expect(t.reference && t.reference.length > 0, "REF").toBe(true)
      expect(t.note && t.note.length > 0, "HISTÓRICO").toBe(true)
      expect(t.description && t.description.length > 0, "DESCRIÇÃO").toBe(true)
      expect(t.groupCode, "GRUPO").toBeGreaterThan(0)
      expect(t.categoryCode.length, "CATEGORIA").toBeGreaterThan(0)
      expect(Math.abs(t.amount), "VALOR").toBeGreaterThan(0)
      expect(t.accountId, "BANCO").toBeGreaterThan(0)
      expect([1, 2, 3]).toContain(t.statusCode) // STATUS
      expect(t.payeeId, "FAVORECIDO").toBeGreaterThan(0)
    }
  })
})
