// WISEVEO — Gerador determinístico do dataset de demonstração (jan/2025 .. dez/2027).
// Porte fiel de docs/superpowers/plans/2026-07-26-demo-db-realista.reference.mjs
// (algoritmo validado na amostra aprovada, semente 20260726). NÃO redesenhar:
// a ordem exata dos sorteios do PRNG é o que reproduz a amostra.
//
// Todos os textos deste arquivo são DADOS de semente (nomes fictícios de comércios,
// em inglês por premissa do produto) — não são cópia de UI e não são traduzidos.

import {
  BASE_PCT,
  CHECKING_INITIAL_BALANCE,
  FILLER_ALLOWANCE,
  FIXED_BILLS,
  GROUPS_EXPENSE_RANGES,
  INCOME_EXTRA,
  SEASONAL_UTILITY_BILLS,
  SEED,
  VARIABLE_TEMPLATES,
  salaryFor,
  seasonMult,
} from "./catalog"

// O teste da Tarefa 1 importa as faixas daqui.
export { GROUPS_EXPENSE_RANGES }

// ---------- Tipos públicos ----------

export type AbstractTx = {
  date: Date // Date.UTC ao meio-dia
  description: string
  payee: string
  group: number // 100..800 (códigos ABSTRATOS; materialize prefixa)
  cat: string // "300.001" etc.
  amount: number // INCOME +, EXPENSE − (2 casas)
  type: "INCOME" | "EXPENSE"
  kind?: "salary" | "freelance" | "dividends"
  paid: boolean // date <= FIXED_CUTOFF (modo fixed)
  overdue?: boolean // D3: statusCode 3 no materialize (calculado lá, não aqui)
}

export type MonthSummary = {
  y: number
  m: number
  label: string
  income: number
  expense: number
  delta: number
  byGroup: Record<number, number>
  txCount: number
}

export type AbstractRecurring = {
  description: string
  payee: string
  group: number
  cat: string
  amount: number
  type: "INCOME" | "EXPENSE"
  statusCode: 1 | 2
  period: string
  lastDate: Date
  kind?: "salary"
}

export type AbstractBudget = { group: number; amount: number }

export type DemoDataset = {
  transactions: AbstractTx[]
  months: MonthSummary[]
  recurringTemplates: AbstractRecurring[]
  budgets: AbstractBudget[]
  catalog: {
    fixedBills: typeof FIXED_BILLS
    seasonalUtilities: typeof SEASONAL_UTILITY_BILLS
    allPayees: string[]
  }
}

/** Corte fixo do dataset abstrato: 27/07/2026 12:00 UTC. */
export const FIXED_CUTOFF = new Date(Date.UTC(2026, 6, 27, 12, 0, 0))

// ---------- PRNG (mulberry32, semente do catálogo) ----------

function mulberry32(a: number): () => number {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------- Constantes locais ----------

const START_BALANCE = CHECKING_INITIAL_BALANCE

const MONTHS: { y: number; m: number }[] = []
for (let y = 2025; y <= 2027; y++) for (let m = 0; m < 12; m++) MONTHS.push({ y, m })

const round2 = (v: number) => Math.round(v * 100) / 100
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
const isWeekend = (y: number, m: number, d: number) =>
  [0, 6].includes(new Date(Date.UTC(y, m, d, 12, 0, 0)).getUTCDay())

// Despesas nunca terminam em ,00 (P3)
const TRIM_DESCRIPTIONS = ["Groceries", "Dinner Out", "Fuel", "Ride-Hailing Trip"] // i18n-ignore: fictional demo seed data, not UI copy

// Contas que NÃO podem mudar de dia (P4): fixas + utilities sazonais.
const IMMOVABLE_DESCRIPTIONS = new Set<string>([
  ...FIXED_BILLS.map((b) => b.description),
  ...SEASONAL_UTILITY_BILLS.map((b) => b.description),
])

type SeasonalBill = {
  desc: string
  payee: string
  g: number
  cat: string
  day: number
  amt: number
}

type SeasonalEvent = {
  desc: string
  payee: string
  g: number
  cat: string
  amt: number
  day: number
}

type FillerOption = [string, string, number, string, number]

// Payees pontuais definidos neste módulo (entram no catálogo fechado — premissa P10).
const ONE_OFF_PAYEES = [
  "City DMV Office", // i18n-ignore: fictional demo seed data, not UI copy
  "TaxRight Filing Services", // i18n-ignore: fictional demo seed data, not UI copy
  "SunTrail Travel Agency", // i18n-ignore: fictional demo seed data, not UI copy
  "Curious Cat Gift Shop", // i18n-ignore: fictional demo seed data, not UI copy
  "Voltify Electronics", // i18n-ignore: fictional demo seed data, not UI copy
  "TurboFix Auto Care", // i18n-ignore: fictional demo seed data, not UI copy
  "GreenLeaf Pharmacy", // i18n-ignore: fictional demo seed data, not UI copy
  "BrightSmile Dental", // i18n-ignore: fictional demo seed data, not UI copy
  "VitalCheck Lab", // i18n-ignore: fictional demo seed data, not UI copy
  "TicketWave Events", // i18n-ignore: fictional demo seed data, not UI copy
]

function buildAllPayees(): string[] {
  const out = new Set<string>()
  for (const b of FIXED_BILLS) out.add(b.payee)
  for (const b of SEASONAL_UTILITY_BILLS) out.add(b.payee)
  for (const list of Object.values(VARIABLE_TEMPLATES)) {
    for (const t of list) {
      if (Array.isArray(t.payee)) for (const p of t.payee) out.add(p)
      else out.add(t.payee)
    }
  }
  out.add(INCOME_EXTRA.salary.payee)
  out.add(INCOME_EXTRA.freelance.payee)
  out.add(INCOME_EXTRA.dividends.payee)
  for (const p of ONE_OFF_PAYEES) out.add(p)
  return [...out]
}

// ---------- Geração ----------

type MonthTx = {
  y: number
  m: number
  day: number
  desc: string
  payee: string
  g: number
  cat: string
  amount: number
  type: "INCOME" | "EXPENSE"
  kind?: AbstractTx["kind"]
}

function generate(): DemoDataset {
  const rand = mulberry32(SEED)
  const R = (min: number, max: number) => min + rand() * (max - min)
  const RI = (min: number, max: number) => Math.floor(R(min, max + 1))
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]

  // Evita centavos ,00 nas despesas
  const fixCents = (v: number) => {
    let x = round2(v)
    if (Math.round(x * 100) % 100 === 0) x = round2(x + RI(7, 93) / 100)
    return x
  }

  // Contas sazonais dos EUA: registro do veículo em março, tax prep em abril (sem sorteios)
  const seasonalBills = (y: number, m: number): SeasonalBill[] => {
    const infl = y === 2025 ? 1 : y === 2026 ? 1.05 : 1.1
    const out: SeasonalBill[] = []
    if (m === 2)
      out.push({
        desc: "Vehicle Registration Renewal", // i18n-ignore: fictional demo seed data, not UI copy
        payee: "City DMV Office", // i18n-ignore: fictional demo seed data, not UI copy
        g: 800,
        cat: "800.002",
        day: 15,
        amt: round2(196.4 * infl),
      })
    if (m === 3)
      out.push({
        desc: "Tax Preparation Service", // i18n-ignore: fictional demo seed data, not UI copy
        payee: "TaxRight Filing Services", // i18n-ignore: fictional demo seed data, not UI copy
        g: 800,
        cat: "800.002",
        day: 12,
        amt: round2(243.7 * infl),
      })
    return out
  }

  // Eventos sazonais (calendário EUA). A ORDEM dos sorteios (amt antes de day) é contratual.
  const seasonalEvents = (y: number, m: number): SeasonalEvent[] => {
    const out: SeasonalEvent[] = []
    const infl = y === 2025 ? 1 : y === 2026 ? 1.045 : 1.09
    if (m === 6)
      out.push({
        desc: "Vacation Package", // i18n-ignore: fictional demo seed data, not UI copy
        payee: "SunTrail Travel Agency", // i18n-ignore: fictional demo seed data, not UI copy
        g: 600,
        cat: "600.001",
        amt: R(1150, 1700) * infl,
        day: RI(2, 10),
      })
    if (m === 11) {
      out.push({
        desc: "Holiday Trip Booking", // i18n-ignore: fictional demo seed data, not UI copy
        payee: "SunTrail Travel Agency", // i18n-ignore: fictional demo seed data, not UI copy
        g: 600,
        cat: "600.001",
        amt: R(750, 1150) * infl,
        day: RI(15, 20),
      })
      out.push({
        desc: "Christmas Gifts", // i18n-ignore: fictional demo seed data, not UI copy
        payee: "Curious Cat Gift Shop", // i18n-ignore: fictional demo seed data, not UI copy
        g: 800,
        cat: "800.001",
        amt: R(420, 700) * infl,
        day: RI(10, 20),
      })
      out.push({
        desc: "Christmas Gifts", // i18n-ignore: fictional demo seed data, not UI copy
        payee: "Curious Cat Gift Shop", // i18n-ignore: fictional demo seed data, not UI copy
        g: 800,
        cat: "800.001",
        amt: R(180, 380) * infl,
        day: RI(20, 23),
      })
    }
    if (m === 10)
      out.push({
        desc: "Black Friday Electronics Deal", // i18n-ignore: fictional demo seed data, not UI copy
        payee: "Voltify Electronics", // i18n-ignore: fictional demo seed data, not UI copy
        g: 800,
        cat: "800.001",
        amt: R(250, 520) * infl,
        day: 28,
      })
    if (m === 4 || m === 8)
      out.push({
        desc: "Birthday Gift", // i18n-ignore: fictional demo seed data, not UI copy
        payee: "Curious Cat Gift Shop", // i18n-ignore: fictional demo seed data, not UI copy
        g: 800,
        cat: "800.001",
        amt: R(120, 260) * infl,
        day: RI(5, 25),
      })
    if (m === 2)
      out.push({
        desc: "Annual Car Service", // i18n-ignore: fictional demo seed data, not UI copy
        payee: "TurboFix Auto Care", // i18n-ignore: fictional demo seed data, not UI copy
        g: 400,
        cat: "400.003",
        amt: R(720, 980) * infl,
        day: RI(8, 20),
      })
    if (m === 8)
      out.push({
        desc: "Brake Pads Replacement", // i18n-ignore: fictional demo seed data, not UI copy
        payee: "TurboFix Auto Care", // i18n-ignore: fictional demo seed data, not UI copy
        g: 400,
        cat: "400.003",
        amt: R(380, 560) * infl,
        day: RI(8, 20),
      })
    if (m === 11 || m === 0 || m === 1)
      // temporada de gripe (dez–fev)
      out.push({
        desc: "Medicines", // i18n-ignore: fictional demo seed data, not UI copy
        payee: "GreenLeaf Pharmacy", // i18n-ignore: fictional demo seed data, not UI copy
        g: 500,
        cat: "500.001",
        amt: R(80, 190) * infl,
        day: RI(3, 26),
      })
    if (m === 3)
      out.push({
        desc: "Dental Visit", // i18n-ignore: fictional demo seed data, not UI copy
        payee: "BrightSmile Dental", // i18n-ignore: fictional demo seed data, not UI copy
        g: 500,
        cat: "500.001",
        amt: R(180, 320) * infl,
        day: RI(5, 25),
      })
    if (m === 9)
      out.push({
        desc: "Medical Exams", // i18n-ignore: fictional demo seed data, not UI copy
        payee: "VitalCheck Lab", // i18n-ignore: fictional demo seed data, not UI copy
        g: 500,
        cat: "500.001",
        amt: R(150, 380) * infl,
        day: RI(5, 25),
      })
    if (m === 1 && y !== 2025)
      out.push({
        desc: "Concert Tickets", // i18n-ignore: fictional demo seed data, not UI copy
        payee: "TicketWave Events", // i18n-ignore: fictional demo seed data, not UI copy
        g: 600,
        cat: "600.001",
        amt: R(160, 340) * infl,
        day: RI(5, 25),
      })
    return out
  }

  // Sobra mensal planejada (renda − despesas). Sazonal + laço de correção (sem sorteios).
  const planDeltas = (): number[] => {
    const base = MONTHS.map(({ m }) => {
      if (m === 11) return R(-950, -600)
      if (m === 6) return R(-550, -250)
      if (m === 0) return R(-420, -150)
      if (m === 10) return R(-150, 100)
      return R(220, 520)
    })
    for (let iter = 0; iter < 200; iter++) {
      let cum = START_BALANCE
      let minCum = Infinity
      let minIdx = -1
      base.forEach((d, i) => {
        cum += d
        if (cum < minCum) {
          minCum = cum
          minIdx = i
        }
      })
      const avg = base.reduce((a, b) => a + b, 0) / base.length
      if (minCum >= 60 && avg >= 50 && avg <= 200) break
      if (minCum < 60) base[minIdx] += 60 - minCum
      else {
        const shift = (avg < 50 ? 50 - avg : 200 - avg) + (avg < 50 ? 5 : -5)
        for (let i = 0; i < base.length; i++) base[i] += shift
      }
    }
    return base.map(round2)
  }

  // 1) Rendas por mês (sorteios adiantados — ordem contratual)
  const incomes = MONTHS.map(({ y }) => {
    const salary = salaryFor(y)
    const dividends = fixCents(R(160, 440))
    const target = R(13600, 15400)
    let freelance = Math.round((target - salary - dividends) / 50) * 50
    freelance = Math.max(INCOME_EXTRA.freelance.min, Math.min(INCOME_EXTRA.freelance.max, freelance))
    return { salary, freelance, dividends, total: round2(salary + freelance + dividends) }
  })

  // 2) Deltas planejados
  const deltas = planDeltas()

  const months: MonthSummary[] = []
  const allTx: AbstractTx[] = []

  // 3) Laço principal por mês
  MONTHS.forEach(({ y, m }, mi) => {
    const inc = incomes[mi]
    const txs: MonthTx[] = []
    const dayCount: Record<number, number> = {}
    const nd = daysInMonth(y, m)

    const addTx = (
      day: number,
      desc: string,
      payee: string,
      g: number,
      cat: string,
      amount: number,
      type: "INCOME" | "EXPENSE",
      kind?: AbstractTx["kind"]
    ) => {
      const d = Math.min(day, nd)
      txs.push({ y, m, day: d, desc, payee, g, cat, amount: round2(amount), type, kind })
      dayCount[d] = (dayCount[d] || 0) + 1
    }

    // Entradas
    addTx(
      INCOME_EXTRA.salary.day,
      INCOME_EXTRA.salary.description,
      INCOME_EXTRA.salary.payee,
      100,
      INCOME_EXTRA.salary.cat,
      inc.salary,
      "INCOME",
      "salary"
    )
    addTx(
      RI(15, 20),
      INCOME_EXTRA.freelance.description,
      INCOME_EXTRA.freelance.payee,
      100,
      INCOME_EXTRA.freelance.cat,
      inc.freelance,
      "INCOME",
      "freelance"
    )
    addTx(
      RI(1, 3),
      INCOME_EXTRA.dividends.description,
      INCOME_EXTRA.dividends.payee,
      100,
      INCOME_EXTRA.dividends.cat,
      inc.dividends,
      "INCOME",
      "dividends"
    )

    // Contas fixas + utilities sazonais + contas sazonais + eventos (sorteados UMA vez)
    const monthBills = seasonalBills(y, m)
    const monthUtilities = SEASONAL_UTILITY_BILLS.map((u) => ({
      desc: u.description,
      payee: u.payee,
      g: u.group,
      cat: u.cat,
      day: u.day,
      v: fixCents(u.values[y] * u.factor(m)),
    }))
    const monthEvents = seasonalEvents(y, m).map((ev) => ({ ...ev, amt: fixCents(ev.amt) }))

    for (const b of FIXED_BILLS) {
      addTx(b.day, b.description, b.payee, b.group, b.cat, -b.values[y], "EXPENSE")
    }
    for (const u of monthUtilities) {
      addTx(u.day, u.desc, u.payee, u.g, u.cat, -u.v, "EXPENSE")
    }
    for (const b of monthBills) {
      addTx(b.day, b.desc, b.payee, b.g, b.cat, -b.amt, "EXPENSE")
    }
    for (const ev of monthEvents) {
      addTx(ev.day, ev.desc, ev.payee, ev.g, ev.cat, -ev.amt, "EXPENSE")
    }

    // 4) Alocação por grupo: meta = % clampado da renda, com piso fixo+eventos+60.
    const expenseTarget = clamp(inc.total - deltas[mi], 12550, 16450)
    const fixedByGroup: Record<string, number> = {}
    const eventsByGroup: Record<string, number> = {}
    for (const b of FIXED_BILLS) fixedByGroup[b.group] = round2((fixedByGroup[b.group] || 0) + b.values[y])
    for (const u of monthUtilities) fixedByGroup[u.g] = round2((fixedByGroup[u.g] || 0) + u.v)
    for (const b of monthBills) eventsByGroup[b.g] = round2((eventsByGroup[b.g] || 0) + b.amt)
    for (const ev of monthEvents) eventsByGroup[ev.g] = round2((eventsByGroup[ev.g] || 0) + ev.amt)

    const housingTotal = fixedByGroup[200] || 0
    const targets: Record<string, number> = {}
    for (const g of Object.keys(BASE_PCT)) {
      const [lo, hi] = GROUPS_EXPENSE_RANGES[Number(g)]
      const pct = clamp(BASE_PCT[Number(g)] * seasonMult(Number(g), m), lo + 0.5, hi - 0.8)
      const floor = (fixedByGroup[g] || 0) + (eventsByGroup[g] || 0) + 60
      targets[g] = Math.max((pct / 100) * inc.total, floor)
    }
    // Redistribui o resíduo até bater expenseTarget, ponderado pela folga de cada grupo
    for (let iter = 0; iter < 12; iter++) {
      const sum = housingTotal + Object.values(targets).reduce((a, b) => a + b, 0)
      const residual = expenseTarget - sum
      if (Math.abs(residual) < 2) break
      const slack: Record<string, number> = {}
      let totalSlack = 0
      for (const g of Object.keys(targets)) {
        const [lo, hi] = GROUPS_EXPENSE_RANGES[Number(g)]
        const hiCap = ((hi - 0.5) / 100) * inc.total
        const loCap = Math.max(
          ((lo + 0.5) / 100) * inc.total,
          (fixedByGroup[g] || 0) + (eventsByGroup[g] || 0) + 60
        )
        const s = residual > 0 ? hiCap - targets[g] : targets[g] - loCap
        if (s > 0) {
          slack[g] = s
          totalSlack += s
        }
      }
      if (totalSlack <= 0) break
      for (const g of Object.keys(slack)) {
        const give = residual * (slack[g] / totalSlack)
        targets[g] += Math.sign(give) * Math.min(Math.abs(give), slack[g])
      }
    }

    // 5) Transações variáveis por grupo, escaladas para (meta − fixo − eventos − filler)
    for (const g of Object.keys(VARIABLE_TEMPLATES)) {
      const budget = Math.max(
        50,
        targets[g] - (fixedByGroup[g] || 0) - (eventsByGroup[g] || 0) - (FILLER_ALLOWANCE[Number(g)] || 0)
      )
      const raw: { day: number; desc: string; payee: string; g: number; cat: string; amt: number }[] = []
      for (const t of VARIABLE_TEMPLATES[Number(g)]) {
        const n = RI(t.n[0], t.n[1])
        for (let i = 0; i < n; i++) {
          const wantWeekend = rand() < t.weekendP
          let day = 1
          let tries = 0
          do {
            day = RI(1, nd)
            tries++
          } while (tries < 40 && ((dayCount[day] || 0) >= 5 || isWeekend(y, m, day) !== wantWeekend))
          raw.push({
            day,
            desc: t.description,
            payee: Array.isArray(t.payee) ? pick(t.payee) : t.payee,
            g: Number(g),
            cat: t.cat,
            amt: R(t.range[0], t.range[1]),
          })
        }
      }
      const rawSum = raw.reduce((a, b) => a + b.amt, 0) || 1
      const scale = budget / rawSum
      for (const r of raw) {
        addTx(r.day, r.desc, r.payee, r.g, r.cat, -fixCents(Math.max(8, r.amt * scale)), "EXPENSE")
      }
    }

    // 6) Fillers: todo dia útil vazio recebe 1 lançamento pequeno
    for (let d = 1; d <= nd; d++) {
      if (!isWeekend(y, m, d) && !(dayCount[d] > 0)) {
        const options: FillerOption[] = [
          ["Coffee", "Brew & Bean Coffee", 300, "300.002", R(11, 24)], // i18n-ignore: fictional demo seed data, not UI copy
          ["Parking", "ParkEasy Garage", 400, "400.002", R(8, 18)], // i18n-ignore: fictional demo seed data, not UI copy
          ["Quick Groceries", "Corner Basket Market", 300, "300.001", R(18, 55)], // i18n-ignore: fictional demo seed data, not UI copy
        ]
        const f = pick(options)
        addTx(d, f[0], f[1], f[2], f[3], -fixCents(f[4]), "EXPENSE")
      }
    }

    // 7) Teto de 5/dia: excedentes migram para o dia útil vizinho com vaga.
    //    Contas fixas E utilities nunca se movem (P4).
    for (let d = 1; d <= nd; d++) {
      while ((dayCount[d] || 0) > 5) {
        const idx = txs.findIndex(
          (t) => t.day === d && t.type === "EXPENSE" && !IMMOVABLE_DESCRIPTIONS.has(t.desc)
        )
        if (idx < 0) break
        let target = d
        for (let k = 1; k < 15; k++) {
          const cand = d - k >= 1 ? d - k : d + k <= nd ? d + k : d
          if ((dayCount[cand] || 0) < 5 && !isWeekend(y, m, cand)) {
            target = cand
            break
          }
        }
        if (target === d) break
        dayCount[d]--
        dayCount[target] = (dayCount[target] || 0) + 1
        txs[idx].day = target
      }
    }

    // 8) Trim: resíduo distribuído nas 9 maiores despesas variáveis de comida/transporte
    const actualExp = txs.filter((t) => t.type === "EXPENSE").reduce((a, b) => a - b.amount, 0)
    const residual = round2(actualExp - expenseTarget)
    const adjPool = txs
      .filter((t) => TRIM_DESCRIPTIONS.includes(t.desc))
      .sort((a, b) => a.amount - b.amount)
      .slice(0, 9)
    if (adjPool.length) {
      const per = residual / adjPool.length
      for (const adj of adjPool) {
        const capped = Math.sign(per) * Math.min(Math.abs(per), -adj.amount * 0.45)
        adj.amount = round2(adj.amount + capped)
        if (Math.round(adj.amount * -100) % 100 === 0) adj.amount = round2(adj.amount - 0.13)
      }
    }

    // 9) Totais do mês, a partir das transações FINAIS
    const totExp = round2(txs.filter((t) => t.type === "EXPENSE").reduce((a, b) => a - b.amount, 0))
    const totInc = round2(txs.filter((t) => t.type === "INCOME").reduce((a, b) => a + b.amount, 0))
    const delta = round2(totInc - totExp)

    const byGroup: Record<number, number> = {}
    for (const t of txs) {
      if (t.type === "EXPENSE") byGroup[t.g] = round2((byGroup[t.g] || 0) - t.amount)
    }

    for (const t of txs) {
      const date = new Date(Date.UTC(t.y, t.m, t.day, 12, 0, 0))
      allTx.push({
        date,
        description: t.desc,
        payee: t.payee,
        group: t.g,
        cat: t.cat,
        amount: t.amount,
        type: t.type,
        ...(t.kind ? { kind: t.kind } : {}),
        paid: date <= FIXED_CUTOFF,
      })
    }

    months.push({
      y,
      m,
      label: `${y}-${String(m + 1).padStart(2, "0")}`,
      income: totInc,
      expense: totExp,
      delta,
      byGroup,
      txCount: txs.length,
    })
  })

  allTx.sort((a, b) => a.date.getTime() - b.date.getTime())

  return {
    transactions: allTx,
    months,
    recurringTemplates: [], // Tarefa 4
    budgets: [], // Tarefa 4
    catalog: {
      fixedBills: FIXED_BILLS,
      seasonalUtilities: SEASONAL_UTILITY_BILLS,
      allPayees: buildAllPayees(),
    },
  }
}

let cached: DemoDataset | null = null

/** Dataset abstrato memoizado (semente fixa — sempre o mesmo resultado). */
export function getDemoDataset(): DemoDataset {
  if (!cached) cached = generate()
  return cached
}
