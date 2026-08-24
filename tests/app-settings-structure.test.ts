import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"
import {
  APP_SETTINGS_TABLE,
  checkAppSettingsStructure,
} from "../src/features/settings/lib/app-settings-structure"
import { APP_SETTINGS_SQL } from "../src/features/settings/services/app-settings-service"
import { isAdditiveOnly } from "../src/features/settings/services/shared-account-service"

/**
 * A tabela de segredos das integrações segue a MESMA disciplina dos convites:
 * "só acrescenta" e "nada fica pela metade". Estes testes guardam essas promessas
 * e a paridade com a migração inicial e o arquivo da linha de comando.
 */
describe("checkAppSettingsStructure", () => {
  it("tabela presente → pronto", () => {
    expect(checkAppSettingsStructure({ hasTable: true })).toEqual({ ready: true, missing: [] })
  })

  it("tabela ausente → lista o que falta", () => {
    expect(checkAppSettingsStructure({ hasTable: false })).toEqual({ ready: false, missing: ["table"] })
  })
})

describe("APP_SETTINGS_SQL", () => {
  it("só acrescenta: nenhum DROP, TRUNCATE ou DELETE FROM", () => {
    expect(isAdditiveOnly(APP_SETTINGS_SQL)).toBe(true)
    expect(/\b(DROP|TRUNCATE)\b/i.test(APP_SETTINGS_SQL)).toBe(false)
  })

  it("roda numa transação e é idempotente (pode reaplicar sem estragar nada)", () => {
    expect(APP_SETTINGS_SQL.trimStart().startsWith("BEGIN;")).toBe(true)
    expect(APP_SETTINGS_SQL.trimEnd().endsWith("COMMIT;")).toBe(true)
    expect(APP_SETTINGS_SQL).toContain("CREATE TABLE IF NOT EXISTS")
  })

  it("cria exatamente a peça que a tela promete", () => {
    expect(APP_SETTINGS_SQL).toContain(`"${APP_SETTINGS_TABLE}"`)
  })

  // Checkout no Windows materializa os .sql com CRLF (autocrlf) — normalizar antes
  // de comparar, senão o teste falha por causa do fim de linha, não do conteúdo.
  const lf = (text: string) => text.replace(/\r\n/g, "\n")

  it("não diverge do arquivo do repositório usado pela linha de comando", () => {
    const file = lf(
      fs.readFileSync(path.resolve(__dirname, "../prisma/additive/2026-08-23-app-settings.sql"), "utf8"),
    )
    const semComentarios = (sql: string) =>
      sql
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim()
    expect(semComentarios(APP_SETTINGS_SQL)).toBe(semComentarios(file))
  })

  it("não diverge da migração inicial (instalação nova e banco preparado ficam iguais)", () => {
    const migration = lf(
      fs.readFileSync(path.resolve(__dirname, "../prisma/migrations/20260816000000_init/migration.sql"), "utf8"),
    )
    // A migração usa CREATE TABLE seco; o aditivo, IF NOT EXISTS — o corpo é o mesmo.
    const body = APP_SETTINGS_SQL.replace("BEGIN;", "")
      .replace("COMMIT;", "")
      .replace("CREATE TABLE IF NOT EXISTS", "CREATE TABLE")
      .trim()
    expect(migration).toContain(body)
  })
})
