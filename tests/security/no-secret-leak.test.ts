import { describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

/**
 * Varredura de vazamento: nenhuma rota de perfil/preferências pode devolver a LINHA CRUA
 * do usuário. Ali moram o hash da senha, os tokens do Google e — desde o fechamento de
 * datas — o `pinHash` dentro de `preferences_json`. Cada rota devolve projeção explícita.
 */
const FULL_USER = {
  id: "u1",
  name: "Ana Souza",
  email: "ana@example.com",
  phone: "+1 555",
  photo: null,
  role: "SUPERADMIN",
  status: "ACTIVE",
  passwordHash: "$2a$10$hash-super-secreto",
  googleAccessToken: "ya29.token-de-acesso",
  googleRefreshToken: "1//refresh-token",
  themePreferences: null,
  preferencesJson: {
    locale: "pt-BR",
    profile: { company: "Wiseveo" },
    monetary: { currency: "USD" },
    notifications: { dailyDigest: { enabled: true, time: "07:30" } },
    appearance: { themeMode: "dark", selectedTheme: "wiseveo" },
    quickPayment: { defaultAccountId: 1, defaultStatusCode: 1 },
    dateClosing: { closedThrough: "2026-08-31", pinHash: "$2a$10$pin-hash" },
  },
}

function project(select?: Record<string, boolean>) {
  if (!select) return { ...FULL_USER }
  return Object.fromEntries(
    Object.keys(select).map((key) => [key, (FULL_USER as Record<string, unknown>)[key]]),
  )
}

vi.mock("@/lib/prisma", () => {
  const client = {
    $executeRaw: async () => 1,
    $queryRaw: async (strings: TemplateStringsArray) =>
      strings.join("?").includes("information_schema") ? [{ data_type: "jsonb" }] : [],
    user: {
      findUnique: async (args: { select?: Record<string, boolean> }) => project(args?.select),
      update: async (args: { select?: Record<string, boolean> }) => project(args?.select),
    },
    account: { findMany: async () => [{ id: 1, name: "Checking" }] },
    transactionStatusLookup: { findMany: async () => [{ code: 1, name: "Paid" }] },
    telegramConnection: { findUnique: async () => ({ isActive: true }) },
  }
  return { prisma: { ...client, $transaction: async (fn: (tx: typeof client) => unknown) => fn(client) } }
})
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }))
vi.mock("@/lib/session", () => ({
  getSession: async () => ({ userId: "u1" }),
  getSessionUserId: async () => "u1",
}))
vi.mock("@/features/transactions/services/get-default-user-id", () => ({
  getDefaultUserId: async () => "u1",
}))
vi.mock("@/lib/data-owner", () => ({ resolveDataOwnerId: async (id: string) => id }))
vi.mock("@/features/settings/services/app-settings-service", () => ({
  readAppSettingsStructure: async () => ({ notificationsReady: true }),
}))

import { PUT as putProfile } from "@/app/api/user/profile/route"
import { GET as getPreferences } from "@/app/api/user/preferences/route"
import { GET as getMonetary } from "@/app/api/user/monetary-preferences/route"
import { GET as getGeneral } from "@/app/api/user/general-preferences/route"
import { GET as getNotifications } from "@/app/api/user/notifications/route"

const SECRETS = [
  "pinHash",
  "passwordHash",
  "preferencesJson",
  "googleAccessToken",
  "googleRefreshToken",
]

/** Caminho tipo "data.quickPayment.defaultAccountId" dentro do corpo já desserializado. */
function at(body: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((value, key) => (value as Record<string, unknown> | null | undefined)?.[key], body)
}

/**
 * Cada rota diz também o que o corpo TEM de trazer. Sem isso a varredura passaria
 * numa rota que devolvesse `{ success: true }` e mais nada: sem segredo, e sem serventia.
 */
const routes: Array<[string, () => Promise<Response>, Array<[string, unknown]>]> = [
  [
    "PUT /api/user/profile",
    () =>
      putProfile(
        new NextRequest("http://localhost:3000/api/user/profile", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ firstName: "Ana", lastName: "Souza", email: "ana@example.com", company: "Wiseveo" }),
        }),
      ),
    [
      ["data.id", FULL_USER.id],
      ["data.email", FULL_USER.email],
      ["data.role", FULL_USER.role],
    ],
  ],
  ["GET /api/user/preferences", () => getPreferences(), [["data.themeMode", "dark"]]],
  ["GET /api/user/monetary-preferences", () => getMonetary(), [["data.currency", "USD"]]],
  [
    "GET /api/user/general-preferences",
    () => getGeneral(),
    [
      ["data.quickPayment.defaultAccountId", 1],
      ["data.options.accounts.0.name", "Checking"],
    ],
  ],
  [
    "GET /api/user/notifications",
    () => getNotifications(),
    [
      ["data.telegramConnected", true],
      ["data.preferences.dailyDigest.time", "07:30"],
    ],
  ],
]

describe("nenhuma rota de perfil/preferências devolve segredo do usuário", () => {
  for (const [name, call, payload] of routes) {
    it(`${name} responde sem segredo no corpo, e ainda com o corpo de verdade`, async () => {
      const res = await call()
      expect(res.status).toBe(200)
      const body = await res.json()
      for (const [path, value] of payload) {
        expect(at(body, path)).toEqual(value)
      }
      const serialized = JSON.stringify(body)
      for (const secret of SECRETS) {
        expect(serialized).not.toContain(secret)
      }
      expect(serialized).not.toContain(FULL_USER.passwordHash)
      expect(serialized).not.toContain(FULL_USER.googleAccessToken)
      expect(serialized).not.toContain(FULL_USER.googleRefreshToken)
      expect(serialized).not.toContain("$2a$10$pin-hash")
    })
  }
})
