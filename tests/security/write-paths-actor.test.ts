import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import fs from "node:fs"
import path from "node:path"

/**
 * Sete caminhos de escrita que ficam FORA da trava de datas (recorrências e orçamento não gravam
 * lançamento) mas ainda resolviam a pessoa por conta própria: fora de produção, sem sessão, isso
 * era "o usuário mais antigo do banco". Aqui todos passam pelo MESMO ator das rotas de lançamento:
 * sem sessão, a rota responde 401 e a action falha do jeito que já falhava; com sessão de quem
 * entrou por convite, a escrita vai para o DONO da conta, nunca para quem clicou. Prisma, contexto
 * e ator são objetos: nenhum banco é tocado.
 */
const m = vi.hoisted(() => ({
  ctx: null as unknown,
  actor: null as unknown,
  /** Opções com que cada rota montou o contexto: todas precisam descartar o token de PIN. */
  ctxOpts: [] as unknown[],
  /** Cada escrita com o userId que ela levou (ou o id da linha, quando o dono já foi conferido). */
  writes: [] as Array<Record<string, unknown>>,
  /** Cada leitura de dono: é por aqui que um `actorUserId` vazado apareceria. */
  lookups: [] as Array<Record<string, unknown>>,
  prefWrites: [] as Array<{ userId: string; keys: string[] }>,
  recurrentArgs: [] as unknown[][],
  existing: { id: "r1" } as Record<string, unknown> | null,
}))

vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))

vi.mock("@/features/security/services/write-context", () => ({
  getWriteContext: async (_request: Request, opts?: unknown) => {
    m.ctxOpts.push(opts)
    return m.ctx
  },
  getWriteActor: async () => m.actor,
}))

vi.mock("@/features/transactions/services/make-recurring", () => ({
  makeRecurring: async (...args: unknown[]) => {
    m.recurrentArgs.push(args)
    return { id: "r-novo" }
  },
}))

vi.mock("@/features/settings/services/user-preferences-write", () => ({
  setUserPreferenceKey: async (_db: unknown, userId: string, key: string) => {
    m.prefWrites.push({ userId, keys: [key] })
  },
  writeUserPreferenceKeys: async (_db: unknown, userId: string, entries: Array<{ key: string }>) => {
    m.prefWrites.push({ userId, keys: entries.map((e) => e.key) })
  },
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: async () => [{ next_id: 7 }],
    recurringTransaction: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        m.writes.push({ op: "recurring.create", userId: data.userId })
        return { id: "r-novo", ...data }
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        m.lookups.push({ op: "recurring.findFirst", userId: where.userId })
        return m.existing
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        m.writes.push({ op: "recurring.update", id: where.id, data })
        return { id: where.id, ...data }
      },
      delete: async ({ where }: { where: { id: string } }) => {
        m.writes.push({ op: "recurring.delete", id: where.id })
        return { id: where.id }
      },
    },
    payee: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        m.lookups.push({ op: "payee.findFirst", userId: where.userId })
        return null
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        m.writes.push({ op: "payee.create", userId: data.userId })
        return { id: data.id }
      },
    },
    budget: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        m.writes.push({ op: "budget.create", userId: data.userId })
        return data
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        m.writes.push({ op: "budget.deleteMany", userId: where.userId })
        return { count: 1 }
      },
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        m.lookups.push({ op: "user.findUnique", userId: where.id })
        return { preferencesJson: { budgetOrder: ["c1", "c2"] } }
      },
    },
  },
}))

import type { Actor } from "@/features/security/lib/permissions"
import type { WriteContext } from "@/features/security/services/write-context"
import { POST as recurringPost } from "@/app/api/recurring-transactions/route"
import { DELETE as recurringDelete, PATCH as recurringPatch } from "@/app/api/recurring-transactions/[id]/route"
import { POST as recurrentPost } from "@/app/api/transactions/[id]/recurrent/route"
import { createBudgetItem } from "@/features/budget/services/create-budget-item"
import {
  deleteBudgetCard,
  saveBudgetFormula,
  saveCardFormula,
  saveCustomBudgetCard,
} from "@/features/budget/services/save-budget-formula"
import { updateBudgetOrder } from "@/features/budget/services/update-budget-order"

/** Quem entrou por convite: age como "convidado", mas os dados são de "dono". */
const MEMBER: Actor = { actorUserId: "convidado", ownerId: "dono", role: "USER", status: "ACTIVE", showcase: false }
const MEMBER_CTX: WriteContext = { ...MEMBER, override: null }

const NO_PIN = [{ allowOverride: false }]

function req(method: string, path: string, body?: Record<string, unknown>) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

const byId = { params: Promise.resolve({ id: "r1" }) }
const txById = { params: Promise.resolve({ id: "t1" }) }

const RECURRING_BODY = {
  description: "Aluguel",
  amount: 100,
  type: "EXPENSE",
  accountId: 1,
  groupCode: 3,
  categoryCode: "3.1",
  statusCode: 2,
  lastDate: "2026-09-05",
}

/** Nada do que saiu para o banco pode carregar quem clicou. */
function expectNothingAsActor() {
  const everything = JSON.stringify([m.writes, m.lookups, m.prefWrites, m.recurrentArgs])
  expect(everything).not.toContain("convidado")
}

beforeEach(() => {
  m.ctx = MEMBER_CTX
  m.actor = MEMBER
  m.ctxOpts = []
  m.writes = []
  m.lookups = []
  m.prefWrites = []
  m.recurrentArgs = []
  m.existing = { id: "r1" }
})

describe("POST /api/recurring-transactions", () => {
  it("sem sessão responde 401 e não grava", async () => {
    m.ctx = null
    const res = await recurringPost(req("POST", "/api/recurring-transactions", RECURRING_BODY))
    expect(res.status).toBe(401)
    expect((await res.json()).error).toMatch(/notAuthenticated$/)
    expect(m.writes).toEqual([])
  })

  it("monta o contexto descartando o token de PIN", async () => {
    await recurringPost(req("POST", "/api/recurring-transactions", RECURRING_BODY))
    expect(m.ctxOpts).toEqual(NO_PIN)
  })

  it("convidado grava a recorrência na conta do DONO", async () => {
    const res = await recurringPost(req("POST", "/api/recurring-transactions", RECURRING_BODY))
    expect(res.status).toBe(200)
    expect(m.writes).toEqual([{ op: "recurring.create", userId: "dono" }])
    expectNothingAsActor()
  })
})

describe("PATCH /api/recurring-transactions/[id]", () => {
  it("sem sessão responde 401 e não grava", async () => {
    m.ctx = null
    const res = await recurringPatch(req("PATCH", "/api/recurring-transactions/r1", { description: "x" }), byId)
    expect(res.status).toBe(401)
    expect((await res.json()).error).toMatch(/notAuthenticated$/)
    expect(m.writes).toEqual([])
    expect(m.lookups).toEqual([])
  })

  it("monta o contexto descartando o token de PIN", async () => {
    await recurringPatch(req("PATCH", "/api/recurring-transactions/r1", { description: "x" }), byId)
    expect(m.ctxOpts).toEqual(NO_PIN)
  })

  it("convidado confere o dono da recorrência pelo DONO e grava", async () => {
    const res = await recurringPatch(req("PATCH", "/api/recurring-transactions/r1", { description: "x" }), byId)
    expect(res.status).toBe(200)
    expect(m.lookups).toEqual([{ op: "recurring.findFirst", userId: "dono" }])
    expect(m.writes).toMatchObject([{ op: "recurring.update", id: "r1" }])
    expectNothingAsActor()
  })

  it("favorecido novo nasce na conta do DONO", async () => {
    const res = await recurringPatch(
      req("PATCH", "/api/recurring-transactions/r1", { description: "x", payeeName: "Padaria" }),
      byId,
    )
    expect(res.status).toBe(200)
    expect(m.lookups).toContainEqual({ op: "payee.findFirst", userId: "dono" })
    expect(m.writes).toContainEqual({ op: "payee.create", userId: "dono" })
    expectNothingAsActor()
  })

  it("recorrência de outra conta responde 404 sem gravar", async () => {
    m.existing = null
    const res = await recurringPatch(req("PATCH", "/api/recurring-transactions/r1", { description: "x" }), byId)
    expect(res.status).toBe(404)
    expect(m.writes).toEqual([])
  })

  /**
   * Competência do modelo (campo PERÍODO do painel): explícita e válida sempre vence, mesmo junto
   * com lastDate; só lastDate (edição em lote de datas) continua rederivando do mês da data; presente
   * e ilegível é 400 antes de qualquer escrita, com ou sem lastDate.
   */
  it("competência explícita vence a data: lastDate normalizado e período como veio", async () => {
    const res = await recurringPatch(
      req("PATCH", "/api/recurring-transactions/r1", { lastDate: "2026-09-15", period: "202608" }),
      byId,
    )
    expect(res.status).toBe(200)
    expect(m.writes).toHaveLength(1)
    const data = m.writes[0].data as Record<string, unknown>
    expect(data.period).toBe("202608")
    expect(data.lastDate).toEqual(new Date("2026-09-15T12:00:00.000Z"))
  })

  it("só lastDate ainda rederiva a competência do mês da data", async () => {
    const res = await recurringPatch(req("PATCH", "/api/recurring-transactions/r1", { lastDate: "2026-09-15" }), byId)
    expect(res.status).toBe(200)
    expect((m.writes[0].data as Record<string, unknown>).period).toBe("202609")
  })

  it("só período válido grava a competência sem mexer na data", async () => {
    const res = await recurringPatch(req("PATCH", "/api/recurring-transactions/r1", { period: "202608" }), byId)
    expect(res.status).toBe(200)
    const data = m.writes[0].data as Record<string, unknown>
    expect(data.period).toBe("202608")
    expect(data).not.toHaveProperty("lastDate")
  })

  it("período ilegível responde 400 sem gravar, com ou sem lastDate", async () => {
    for (const body of [{ period: "202613" }, { lastDate: "2026-09-15", period: "2026-08" }, { period: 202608.5 }]) {
      m.writes = []
      const res = await recurringPatch(req("PATCH", "/api/recurring-transactions/r1", body), byId)
      expect(res.status).toBe(400)
      expect((await res.json()).error).toMatch(/invalidPeriod$/)
      expect(m.writes).toEqual([])
    }
  })

  it("período com espaços em volta é aceito aparado", async () => {
    const res = await recurringPatch(req("PATCH", "/api/recurring-transactions/r1", { period: " 202608 " }), byId)
    expect(res.status).toBe(200)
    expect((m.writes[0].data as Record<string, unknown>).period).toBe("202608")
  })
})

describe("DELETE /api/recurring-transactions/[id]", () => {
  it("sem sessão responde 401 e não apaga", async () => {
    m.ctx = null
    const res = await recurringDelete(req("DELETE", "/api/recurring-transactions/r1"), byId)
    expect(res.status).toBe(401)
    expect((await res.json()).error).toMatch(/notAuthenticated$/)
    expect(m.writes).toEqual([])
    expect(m.lookups).toEqual([])
  })

  it("monta o contexto descartando o token de PIN", async () => {
    await recurringDelete(req("DELETE", "/api/recurring-transactions/r1"), byId)
    expect(m.ctxOpts).toEqual(NO_PIN)
  })

  it("convidado confere o dono pelo DONO e apaga", async () => {
    const res = await recurringDelete(req("DELETE", "/api/recurring-transactions/r1"), byId)
    expect(res.status).toBe(200)
    expect(m.lookups).toEqual([{ op: "recurring.findFirst", userId: "dono" }])
    expect(m.writes).toEqual([{ op: "recurring.delete", id: "r1" }])
    expectNothingAsActor()
  })

  it("recorrência de outra conta responde 404 sem apagar", async () => {
    m.existing = null
    const res = await recurringDelete(req("DELETE", "/api/recurring-transactions/r1"), byId)
    expect(res.status).toBe(404)
    expect(m.writes).toEqual([])
  })
})

describe("POST /api/transactions/[id]/recurrent", () => {
  it("sem sessão responde 401 e não cria modelo", async () => {
    m.ctx = null
    const res = await recurrentPost(req("POST", "/api/transactions/t1/recurrent"), txById)
    expect(res.status).toBe(401)
    expect((await res.json()).error).toMatch(/notAuthenticated$/)
    expect(m.recurrentArgs).toEqual([])
  })

  it("monta o contexto descartando o token de PIN", async () => {
    await recurrentPost(req("POST", "/api/transactions/t1/recurrent"), txById)
    expect(m.ctxOpts).toEqual(NO_PIN)
  })

  it("convidado torna recorrente pelo DONO", async () => {
    const res = await recurrentPost(req("POST", "/api/transactions/t1/recurrent"), txById)
    expect(res.status).toBe(200)
    expect(m.recurrentArgs).toEqual([["t1", "dono"]])
    expectNothingAsActor()
  })
})

describe("createBudgetItem (server action)", () => {
  it("sem sessão falha como sempre falhou e não grava", async () => {
    m.actor = null
    await expect(createBudgetItem({ groupId: "g1", amount: 10 })).rejects.toThrow("User not found")
    expect(m.writes).toEqual([])
  })

  it("convidado cria o orçamento na conta do DONO", async () => {
    await createBudgetItem({ groupId: "g1", amount: 10 })
    expect(m.writes).toEqual([{ op: "budget.create", userId: "dono" }])
    expectNothingAsActor()
  })

  it("orçamento de categoria idem", async () => {
    await createBudgetItem({ groupId: "g1", categoryId: "c1", amount: 10 })
    expect(m.writes).toEqual([{ op: "budget.create", userId: "dono" }])
    expectNothingAsActor()
  })
})

describe("save-budget-formula (server actions)", () => {
  const CONFIG = { global: { id: "simple_avg", params: {} }, perCard: {} } as never

  it("saveBudgetFormula sem sessão falha e não grava", async () => {
    m.actor = null
    await expect(saveBudgetFormula(CONFIG)).rejects.toThrow("User not found")
    expect(m.prefWrites).toEqual([])
  })
  it("saveBudgetFormula grava na conta do DONO", async () => {
    await saveBudgetFormula(CONFIG)
    expect(m.prefWrites).toEqual([{ userId: "dono", keys: ["budgetFormula"] }])
    expectNothingAsActor()
  })

  it("saveCardFormula sem sessão falha e não grava", async () => {
    m.actor = null
    await expect(saveCardFormula("c1", null)).rejects.toThrow("User not found")
    expect(m.prefWrites).toEqual([])
    expect(m.lookups).toEqual([])
  })
  it("saveCardFormula lê e grava na conta do DONO", async () => {
    await saveCardFormula("c1", null)
    expect(m.lookups).toEqual([{ op: "user.findUnique", userId: "dono" }])
    expect(m.prefWrites).toEqual([{ userId: "dono", keys: ["budgetFormula"] }])
    expectNothingAsActor()
  })

  it("saveCustomBudgetCard sem sessão falha e não grava", async () => {
    m.actor = null
    await expect(saveCustomBudgetCard({ id: "x", name: "N", groupIds: [], categoryIds: [], amount: 1 })).rejects.toThrow("User not found")
    expect(m.prefWrites).toEqual([])
  })
  it("saveCustomBudgetCard lê e grava na conta do DONO", async () => {
    await saveCustomBudgetCard({ id: "x", name: "N", groupIds: [], categoryIds: [], amount: 1 })
    expect(m.lookups).toEqual([{ op: "user.findUnique", userId: "dono" }])
    expect(m.prefWrites).toEqual([{ userId: "dono", keys: ["budgetFormula"] }])
    expectNothingAsActor()
  })

  it("deleteBudgetCard sem sessão falha e não apaga nada", async () => {
    m.actor = null
    await expect(deleteBudgetCard("c1", true)).rejects.toThrow("User not found")
    await expect(deleteBudgetCard("g1", false)).rejects.toThrow("User not found")
    expect(m.prefWrites).toEqual([])
    expect(m.writes).toEqual([])
  })
  it("deleteBudgetCard de card custom regrava as chaves do DONO", async () => {
    await deleteBudgetCard("c1", true)
    expect(m.lookups).toEqual([{ op: "user.findUnique", userId: "dono" }])
    expect(m.prefWrites).toEqual([{ userId: "dono", keys: ["budgetFormula", "budgetOrder"] }])
    expectNothingAsActor()
  })
  it("deleteBudgetCard nativo apaga as linhas do DONO", async () => {
    await deleteBudgetCard("g1", false)
    expect(m.writes).toEqual([{ op: "budget.deleteMany", userId: "dono" }])
    expectNothingAsActor()
  })
})

describe("updateBudgetOrder (server action)", () => {
  it("sem sessão devolve o erro de sempre e não grava", async () => {
    m.actor = null
    expect(await updateBudgetOrder(["b", "a"])).toEqual({ success: false, error: "Unauthorized" })
    expect(m.prefWrites).toEqual([])
  })

  it("convidado grava a ordem na conta do DONO (a ordem é da conta, não da pessoa)", async () => {
    expect(await updateBudgetOrder(["b", "a"])).toEqual({ success: true })
    expect(m.prefWrites).toEqual([{ userId: "dono", keys: ["budgetOrder"] }])
    expectNothingAsActor()
  })
})

/**
 * Catraca: nenhum destes arquivos volta a resolver a pessoa pelo resolvedor de LEITURA. A agulha é
 * montada em partes para que este teste não encontre a si mesmo.
 */
const NEEDLE = ["getDefault", "UserId"].join("")
const ROOT = path.resolve(__dirname, "../..")
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8")

/** Só os handlers de ESCRITA: o GET que mora no mesmo arquivo é leitura e continua como está. */
function writeHandlersOf(source: string): string {
  return source
    .split(/(?=^export async function )/m)
    .filter((chunk) => /^export async function (?!GET\b)/.test(chunk))
    .join("\n")
}
const whole = (source: string) => source

const WRITE_PATHS: Array<{ file: string; scope: (source: string) => string }> = [
  { file: "src/app/api/recurring-transactions/route.ts", scope: writeHandlersOf },
  { file: "src/app/api/recurring-transactions/[id]/route.ts", scope: whole },
  { file: "src/app/api/transactions/[id]/recurrent/route.ts", scope: whole },
  { file: "src/features/budget/services/create-budget-item.ts", scope: whole },
  { file: "src/features/budget/services/save-budget-formula.ts", scope: whole },
  { file: "src/features/budget/services/update-budget-order.ts", scope: whole },
]

describe("catraca: caminhos de escrita não resolvem a pessoa pelo resolvedor de leitura", () => {
  it("a agulha encontra o nome onde ele existe de verdade", () => {
    expect(read("src/features/transactions/services/get-default-user-id.ts")).toContain(NEEDLE)
    const both = `export async function GET() { ${NEEDLE} }\nexport async function POST() { ${NEEDLE} }\n`
    expect(writeHandlersOf(both)).toContain(NEEDLE)
    expect(writeHandlersOf(`export async function GET() { ${NEEDLE} }\n`)).not.toContain(NEEDLE)
  })

  it("o arquivo de recorrências ainda tem o POST separado do GET", () => {
    expect(writeHandlersOf(read("src/app/api/recurring-transactions/route.ts"))).toMatch(/^export async function POST\(/m)
  })

  for (const { file, scope } of WRITE_PATHS) {
    it(`${file} não menciona o resolvedor de leitura`, () => {
      const source = read(file)
      expect(source.length).toBeGreaterThan(0)
      expect(scope(source)).not.toContain(NEEDLE)
    })
  }
})
