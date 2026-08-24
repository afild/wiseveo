import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"
import {
  AI_USAGE_TABLE,
  APP_SETTINGS_TABLE,
  INTEGRATION_TABLES,
  checkAppSettingsStructure,
} from "../src/features/settings/lib/app-settings-structure"
import { APP_SETTINGS_SQL } from "../src/features/settings/services/app-settings-service"
import { isAdditiveOnly } from "../src/features/settings/services/shared-account-service"

/**
 * As tabelas das integrações seguem a MESMA disciplina dos convites:
 * "só acrescenta" e "nada fica pela metade". Estes testes guardam essas promessas
 * e a paridade com a migração inicial e o arquivo da linha de comando.
 */
describe("checkAppSettingsStructure", () => {
  it("as duas tabelas presentes → pronto", () => {
    expect(checkAppSettingsStructure({ existingTables: [...INTEGRATION_TABLES] })).toEqual({
      ready: true,
      secretsReady: true,
      missing: [],
    })
  })

  it("lista exatamente o que falta", () => {
    expect(checkAppSettingsStructure({ existingTables: [APP_SETTINGS_TABLE] })).toEqual({
      ready: false,
      secretsReady: true,
      missing: [AI_USAGE_TABLE],
    })
    expect(checkAppSettingsStructure({ existingTables: [AI_USAGE_TABLE] })).toEqual({
      ready: false,
      secretsReady: false,
      missing: [APP_SETTINGS_TABLE],
    })
    expect(checkAppSettingsStructure({ existingTables: [] })).toEqual({
      ready: false,
      secretsReady: false,
      missing: [APP_SETTINGS_TABLE, AI_USAGE_TABLE],
    })
  })

  it("faltando só o medidor, os SEGREDOS continuam disponíveis (o bot não trava)", () => {
    // A tabela do medidor de IA não pode derrubar a tela do bot do Telegram, que
    // depende só de `app_settings`.
    const structure = checkAppSettingsStructure({ existingTables: [APP_SETTINGS_TABLE] })
    expect(structure.secretsReady).toBe(true)
    expect(structure.ready).toBe(false)
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

  it("cria exatamente as peças que a tela promete", () => {
    for (const table of INTEGRATION_TABLES) {
      expect(APP_SETTINGS_SQL).toContain(`"${table}"`)
    }
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
    // A migração usa CREATE TABLE seco (com comentários entre os blocos); o aditivo,
    // IF NOT EXISTS — comparar cada bloco CREATE TABLE individualmente.
    const blocks = APP_SETTINGS_SQL.split(/\n\n(?=CREATE TABLE)/)
      .map((chunk) => chunk.replace("BEGIN;", "").replace("COMMIT;", "").trim())
      .filter((chunk) => chunk.startsWith("CREATE TABLE"))
      .map((chunk) => chunk.replace("CREATE TABLE IF NOT EXISTS", "CREATE TABLE"))
    expect(blocks).toHaveLength(INTEGRATION_TABLES.length)
    for (const block of blocks) {
      expect(migration).toContain(block)
    }
  })
})
