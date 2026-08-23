import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { REQUIRED_USERS_COLUMNS, SCHEMA_OK, checkUsersSchema } from "../src/features/setup/lib/schema-check"

/**
 * Colunas reais do model User em prisma/schema.prisma: todo campo escalar ou enum
 * (não relação), com o nome de @map("x") quando houver, senão o nome do campo.
 */
function userColumnsFromPrismaSchema(): string[] {
  const schema = fs.readFileSync(path.resolve(__dirname, "../prisma/schema.prisma"), "utf8")
  const models = new Set([...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]))
  const block = schema.match(/^model User \{([\s\S]*?)^\}/m)?.[1] ?? ""
  const columns: string[] = []
  for (const raw of block.split("\n")) {
    const line = raw.trim()
    if (!line || line.startsWith("//") || line.startsWith("@@")) continue
    const [field, type] = line.split(/\s+/)
    if (!field || !type) continue
    const base = type.replace(/[?[\]]/g, "")
    if (models.has(base) || line.includes("@relation(")) continue
    const mapped = line.match(/@map\("([^"]+)"\)/)?.[1]
    columns.push(mapped ?? field)
  }
  return columns
}

describe("REQUIRED_USERS_COLUMNS", () => {
  it("espelha exatamente as colunas do model User do schema.prisma (quem mudar o model tem de mudar aqui)", () => {
    expect([...REQUIRED_USERS_COLUMNS].sort()).toEqual(userColumnsFromPrismaSchema().sort())
  })

  it("inclui as colunas que o primeiro acesso precisa", () => {
    for (const c of ["id", "email", "password_hash", "google_id", "role", "status", "preferences_json"]) {
      expect(REQUIRED_USERS_COLUMNS).toContain(c)
    }
  })
})

describe("checkUsersSchema", () => {
  it("banco completo → ok, sem faltas (colunas extras são ignoradas)", () => {
    expect(checkUsersSchema([...REQUIRED_USERS_COLUMNS, "legacy_col"])).toEqual(SCHEMA_OK)
  })

  it("sem google_token_expires_at → lista só ela", () => {
    const cols = REQUIRED_USERS_COLUMNS.filter((c) => c !== "google_token_expires_at")
    expect(checkUsersSchema(cols)).toEqual({ ok: false, missingColumns: ["google_token_expires_at"] })
  })

  it("compara sem diferenciar maiúsculas (themePreferences vem assim do Postgres)", () => {
    const cols = REQUIRED_USERS_COLUMNS.map((c) => c.toUpperCase())
    expect(checkUsersSchema(cols).ok).toBe(true)
  })

  it("tabela inexistente (nenhuma coluna) → todas faltam, na ordem da lista", () => {
    expect(checkUsersSchema([]).missingColumns).toEqual([...REQUIRED_USERS_COLUMNS])
  })
})
