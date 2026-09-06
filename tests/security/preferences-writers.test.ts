import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

/**
 * Catraca dos escritores de `users.preferences_json`: nenhum deles pode mandar o objeto
 * INTEIRO pelo Prisma. Quem regrava tudo desfaz o fechamento de datas de outra pessoa (ou
 * apaga o PIN) só por ter lido o JSON um instante antes. Aqui cada escritor tem de tocar
 * apenas a própria chave, no banco.
 */
const m = vi.hoisted(() => ({
  raw: [] as Array<{ sql: string; values: unknown[] }>,
  updates: [] as unknown[],
  prefs: {} as Record<string, unknown>,
}))
vi.mock("@/lib/prisma", () => {
  const exec = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    m.raw.push({ sql: strings.join("?"), values: flat(values) }); return 1
  }
  // Os `${}` das instruções carregam fragmentos Prisma.sql aninhados: achata para ver os valores.
  const flat = (values: unknown[]): unknown[] =>
    values.flatMap((v) => {
      const s = v as { strings?: readonly string[]; values?: unknown[] }
      return v && typeof v === "object" && Array.isArray(s.strings) && Array.isArray(s.values) ? flat(s.values) : [v]
    })
  const query = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join("?"); m.raw.push({ sql, values: flat(values) })
    return sql.includes("information_schema") ? [{ data_type: "jsonb" }] : [{ prev_type: "object" }]
  }
  /**
   * As escritas em preferences_json chegam como TEXTO + array de valores, nunca como template com
   * fragmento aninhado: os valores já vêm simples e o texto já traz os `$n`.
   */
  const queryUnsafe = async (sql: string, ...values: unknown[]) => {
    m.raw.push({ sql, values })
    return sql.includes("information_schema") ? [{ data_type: "jsonb" }] : [{ prev_type: "object" }]
  }
  const client = {
    $executeRaw: exec, $queryRaw: query, $queryRawUnsafe: queryUnsafe,
    user: {
      findUnique: async () => ({ preferencesJson: m.prefs, themePreferences: null }),
      update: async (args: unknown) => { m.updates.push(args); return {} },
    },
    account: { findFirst: async () => ({ id: 1 }) },
    transactionStatusLookup: { findFirst: async () => ({ code: 1 }) },
    budget: { deleteMany: async () => ({ count: 0 }) },
  }
  return { prisma: { ...client, $transaction: async (fn: (tx: typeof client) => unknown) => fn(client) } }
})
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))
vi.mock("@/lib/data-owner", () => ({ resolveDataOwnerId: async (id: string) => id }))
vi.mock("@/lib/session", () => ({ getSession: async () => ({ userId: "u1" }), getSessionUserId: async () => "u1" }))
vi.mock("@/features/transactions/services/get-default-user-id", () => ({ getDefaultUserId: async () => "dono" }))

import {
  setUserCardTheme,
  setUserLocale,
  updateUserAppearance,
  updateUserMonetarySettings,
  updateUserNotificationSettings,
  updateUserProfile,
  updateUserQuickPaymentSettings,
  updateUserRadarPreferences,
} from "@/features/settings/services/user-settings-service"
import {
  deleteBudgetCard,
  saveBudgetFormula,
  saveCardFormula,
  saveCustomBudgetCard,
} from "@/features/budget/services/save-budget-formula"
import { updateBudgetOrder } from "@/features/budget/services/update-budget-order"
import { PUT as putProfile } from "@/app/api/user/profile/route"

beforeEach(() => {
  m.raw = []
  m.updates = []
  m.prefs = {
    dateClosing: { closedThrough: "2026-08-31" },
    budgetFormula: { global: { id: "simple_avg", params: {} }, perCard: { c1: { id: "x", params: {} } } },
    budgetOrder: ["c1", "c2"],
  }
})

function keysWritten() {
  return m.raw.filter((c) => c.sql.includes("UPDATE users")).flatMap((c) => c.values.filter((v) => typeof v === "string"))
}
function sentPreferencesJson() {
  return m.updates.some((u) => JSON.stringify(u).includes("preferencesJson"))
}
function writtenValue(sql = "jsonb_set") {
  const written = m.raw.find((c) => c.sql.includes(sql))!
  return JSON.parse(written.values.find((v) => typeof v === "string" && v.startsWith("{")) as string)
}

describe("escritores de preferences_json gravam só a própria chave", () => {
  it("setUserLocale usa jsonb_set em 'locale' e nunca manda preferencesJson pelo Prisma", async () => {
    await setUserLocale("u1", "pt-BR")
    expect(keysWritten()).toContain("locale")
    expect(sentPreferencesJson()).toBe(false)
  })
  it("setUserCardTheme (acionável pelo Telegram) idem para 'cardTheme'", async () => {
    await setUserCardTheme("u1", "light")
    expect(keysWritten()).toContain("cardTheme")
    expect(sentPreferencesJson()).toBe(false)
  })
  it("updateUserMonetarySettings grava 'monetary' completo", async () => {
    await updateUserMonetarySettings("u1", { currency: "USD" } as never)
    expect(keysWritten()).toContain("monetary")
    expect(sentPreferencesJson()).toBe(false)
  })
  it("updateUserRadarPreferences grava 'radar'", async () => {
    await updateUserRadarPreferences("u1", { mode: "lookahead", horizonDays: 30, green: 300, amber: null, red: 100 })
    expect(keysWritten()).toContain("radar")
    expect(sentPreferencesJson()).toBe(false)
  })
  it("updateUserNotificationSettings grava 'notifications'", async () => {
    await updateUserNotificationSettings("u1", {})
    expect(keysWritten()).toContain("notifications")
    expect(sentPreferencesJson()).toBe(false)
  })
  it("updateUserQuickPaymentSettings grava 'quickPayment'", async () => {
    await updateUserQuickPaymentSettings("u1", { defaultAccountId: 1, defaultStatusCode: 1 })
    expect(keysWritten()).toContain("quickPayment")
    expect(sentPreferencesJson()).toBe(false)
  })
  it("updateUserAppearance grava a coluna themePreferences e a chave 'appearance' sem o JSON inteiro", async () => {
    await updateUserAppearance("u1", { theme: "dark" } as never)
    expect(keysWritten()).toContain("appearance")
    expect(sentPreferencesJson()).toBe(false)
    expect(m.updates.some((u) => JSON.stringify(u).includes("themePreferences"))).toBe(true)
  })
  it("updateUserProfile grava as colunas e a chave 'profile' sem o JSON inteiro", async () => {
    await updateUserProfile("u1", { firstName: "A", lastName: "B", email: "a@b.c" })
    expect(keysWritten()).toContain("profile")
    expect(sentPreferencesJson()).toBe(false)
  })
  it("PUT /api/user/profile (a rota, não o serviço) grava a chave 'profile' sem o JSON inteiro", async () => {
    const res = await putProfile(
      new NextRequest("http://localhost:3000/api/user/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ firstName: "A", lastName: "B", email: "a@b.c", company: "Wiseveo" }),
      }),
    )
    expect(res.status).toBe(200)
    expect(keysWritten()).toContain("profile")
    expect(sentPreferencesJson()).toBe(false)
  })
  it("saveBudgetFormula grava 'budgetFormula'", async () => {
    await saveBudgetFormula({ global: { id: "simple_avg", params: {} }, perCard: {} } as never)
    expect(keysWritten()).toContain("budgetFormula")
    expect(sentPreferencesJson()).toBe(false)
  })
  it("saveCardFormula com null remove o override de verdade (valor completo recalculado)", async () => {
    await saveCardFormula("c1", null)
    expect(writtenValue().perCard).toEqual({})
    expect(sentPreferencesJson()).toBe(false)
  })
  it("saveCustomBudgetCard grava 'budgetFormula' com o card novo", async () => {
    await saveCustomBudgetCard({ id: "novo", name: "N", groupIds: [], categoryIds: [], amount: 1 })
    expect(keysWritten()).toContain("budgetFormula")
    expect(writtenValue().customCards).toHaveLength(1)
    expect(sentPreferencesJson()).toBe(false)
  })
  it("deleteBudgetCard grava budgetFormula e budgetOrder num único UPDATE", async () => {
    await deleteBudgetCard("c1", true)
    const updates = m.raw.filter((c) => c.sql.includes("UPDATE users"))
    expect(updates.length).toBe(1)
    const value = JSON.parse(updates[0].values.find((v) => typeof v === "string" && v.startsWith("{")) as string)
    expect(value.budgetOrder).toEqual(["c2"])
    expect(value.budgetFormula.perCard).toEqual({})
    expect(sentPreferencesJson()).toBe(false)
  })
  it("updateBudgetOrder grava 'budgetOrder' como array", async () => {
    await updateBudgetOrder(["b", "a"])
    const written = m.raw.find((c) => c.sql.includes("jsonb_set"))!
    expect(written.values).toContain(JSON.stringify(["b", "a"]))
    expect(sentPreferencesJson()).toBe(false)
  })
})
