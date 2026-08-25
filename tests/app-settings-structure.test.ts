import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"
import {
  ADVISOR_MESSAGES_TABLE,
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
  it("todas as tabelas presentes → pronto", () => {
    expect(checkAppSettingsStructure({ existingTables: [...INTEGRATION_TABLES] })).toEqual({
      ready: true,
      secretsReady: true,
      advisorReady: true,
      missing: [],
    })
  })

  it("lista exatamente o que falta", () => {
    expect(checkAppSettingsStructure({ existingTables: [APP_SETTINGS_TABLE] })).toEqual({
      ready: false,
      secretsReady: true,
      advisorReady: false,
      missing: [AI_USAGE_TABLE, ADVISOR_MESSAGES_TABLE],
    })
    expect(checkAppSettingsStructure({ existingTables: [AI_USAGE_TABLE] })).toEqual({
      ready: false,
      secretsReady: false,
      advisorReady: false,
      missing: [APP_SETTINGS_TABLE, ADVISOR_MESSAGES_TABLE],
    })
    expect(checkAppSettingsStructure({ existingTables: [] })).toEqual({
      ready: false,
      secretsReady: false,
      advisorReady: false,
      missing: [...INTEGRATION_TABLES],
    })
  })

  it("cada recurso depende SÓ da sua tabela (uma faltando não derruba as outras)", () => {
    // Acrescentar a tabela do medidor não pode derrubar a tela do bot, nem a do
    // Advisor — foi o que quase aconteceu quando `ready` era um flag só.
    const semMedidor = checkAppSettingsStructure({
      existingTables: [APP_SETTINGS_TABLE, ADVISOR_MESSAGES_TABLE],
    })
    expect(semMedidor.secretsReady).toBe(true)
    expect(semMedidor.advisorReady).toBe(true)
    expect(semMedidor.ready).toBe(false)

    const soMedidor = checkAppSettingsStructure({ existingTables: [AI_USAGE_TABLE] })
    expect(soMedidor.secretsReady).toBe(false)
    expect(soMedidor.advisorReady).toBe(false)
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
    // A migração usa CREATE TABLE seco e agrupa os índices no fim; o aditivo usa
    // IF NOT EXISTS e mantém cada índice junto da sua tabela. Comparar então
    // cada COMANDO isoladamente, e não o arquivo inteiro.
    const tableBlocks = [...APP_SETTINGS_SQL.matchAll(/CREATE TABLE IF NOT EXISTS[\s\S]*?\n\);/g)].map(
      (match) => match[0].replace("CREATE TABLE IF NOT EXISTS", "CREATE TABLE"),
    )
    expect(tableBlocks).toHaveLength(INTEGRATION_TABLES.length)
    for (const block of tableBlocks) {
      expect(migration).toContain(block)
    }

    // Contar ANTES de comparar: sem isto, esquecer o índice no SQL aditivo
    // deixaria o laço rodar zero vezes e o teste passaria — justamente a
    // divergência que ele existe para pegar.
    const indexStatements = [...APP_SETTINGS_SQL.matchAll(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS .*;/g)].map(
      (match) => match[0].replace(" IF NOT EXISTS", ""),
    )
    const indexesInMigration = [...migration.matchAll(/CREATE (?:UNIQUE )?INDEX "([^"]+)"/g)]
      .map((match) => match[1])
      .filter((name) => INTEGRATION_TABLES.some((table) => name.startsWith(table)))
    expect(indexStatements).toHaveLength(indexesInMigration.length)
    for (const statement of indexStatements) {
      expect(migration).toContain(statement)
    }

    // Mesma regra para as chaves estrangeiras das tabelas novas.
    const fkInSql = [...APP_SETTINGS_SQL.matchAll(/ADD CONSTRAINT "([^"]+_fkey)"/g)].map((m) => m[1])
    const fkInMigration = [...migration.matchAll(/ADD CONSTRAINT "([^"]+_fkey)"/g)]
      .map((m) => m[1])
      .filter((name) => INTEGRATION_TABLES.some((table) => name.startsWith(table)))
    expect([...fkInSql].sort()).toEqual([...fkInMigration].sort())
  })
})
