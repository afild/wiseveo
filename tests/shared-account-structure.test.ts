import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"
import {
  checkSharedAccountStructure,
  SHARED_ACCOUNT_COLUMN,
  SHARED_ACCOUNT_TABLE,
} from "../src/features/settings/lib/shared-account-structure"
import {
  describeConnectionError,
  isAdditiveOnly,
  SHARED_ACCOUNT_SQL,
} from "../src/features/settings/services/shared-account-service"

/**
 * Preparar o banco para os convites é a ÚNICA mudança de estrutura que o WISEVEO faz
 * no banco do dono. Estes testes guardam as duas promessas feitas na tela: "só
 * acrescenta" e "nada fica pela metade".
 */
describe("checkSharedAccountStructure", () => {
  it("as duas peças presentes → pronto", () => {
    expect(checkSharedAccountStructure({ hasColumn: true, hasTable: true })).toEqual({ ready: true, missing: [] })
  })

  it("lista exatamente o que falta", () => {
    expect(checkSharedAccountStructure({ hasColumn: false, hasTable: true })).toEqual({
      ready: false,
      missing: ["column"],
    })
    expect(checkSharedAccountStructure({ hasColumn: true, hasTable: false })).toEqual({
      ready: false,
      missing: ["table"],
    })
    expect(checkSharedAccountStructure({ hasColumn: false, hasTable: false })).toEqual({
      ready: false,
      missing: ["column", "table"],
    })
  })
})

describe("SHARED_ACCOUNT_SQL", () => {
  it("só acrescenta: nenhum DROP nem TRUNCATE", () => {
    expect(isAdditiveOnly(SHARED_ACCOUNT_SQL)).toBe(true)
    expect(/\b(DROP|TRUNCATE)\b/i.test(SHARED_ACCOUNT_SQL)).toBe(false)
  })

  it("recusa SQL destrutivo, inclusive escondido depois de um comando válido", () => {
    expect(isAdditiveOnly('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "x" TEXT;\nDROP TABLE "users";')).toBe(false)
    expect(isAdditiveOnly('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "x" TEXT;\nDELETE FROM "users";')).toBe(false)
    expect(isAdditiveOnly('TRUNCATE "transactions";')).toBe(false)
    expect(isAdditiveOnly("-- DROP TABLE users\nALTER TABLE \"users\" ADD COLUMN IF NOT EXISTS \"x\" TEXT;")).toBe(true)
  })

  it("mas aceita a cláusula ON DELETE de uma chave estrangeira (não é um comando)", () => {
    expect(SHARED_ACCOUNT_SQL).toContain("ON DELETE SET NULL")
    expect(SHARED_ACCOUNT_SQL).toContain("ON DELETE CASCADE")
    expect(isAdditiveOnly(SHARED_ACCOUNT_SQL)).toBe(true)
  })

  it("roda numa transação e é idempotente (pode reaplicar sem estragar nada)", () => {
    expect(SHARED_ACCOUNT_SQL.trimStart().startsWith("BEGIN;")).toBe(true)
    expect(SHARED_ACCOUNT_SQL.trimEnd().endsWith("COMMIT;")).toBe(true)
    expect(SHARED_ACCOUNT_SQL).toContain("ADD COLUMN IF NOT EXISTS")
    expect(SHARED_ACCOUNT_SQL).toContain("CREATE TABLE IF NOT EXISTS")
    expect(SHARED_ACCOUNT_SQL).toContain("CREATE UNIQUE INDEX IF NOT EXISTS")
  })

  it("cria exatamente as duas peças que a tela promete", () => {
    expect(SHARED_ACCOUNT_SQL).toContain(`"${SHARED_ACCOUNT_COLUMN}"`)
    expect(SHARED_ACCOUNT_SQL).toContain(`"${SHARED_ACCOUNT_TABLE}"`)
  })

  it("não diverge do arquivo do repositório usado pela linha de comando", () => {
    const file = fs.readFileSync(
      path.resolve(__dirname, "../prisma/additive/2026-08-16-conta-compartilhada.sql"),
      "utf8",
    )
    const semComentarios = (sql: string) =>
      sql
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim()
    expect(semComentarios(SHARED_ACCOUNT_SQL)).toBe(semComentarios(file))
  })
})

/**
 * A falha mais provável ao preparar o banco é de CONEXÃO — e a tentativa IPv4/IPv6 do
 * `pg` devolve um AggregateError de mensagem vazia. Sem tratamento, a tela diria
 * "Não foi possível preparar o banco: ." e o dono ficaria sem diagnóstico nenhum.
 */
describe("describeConnectionError", () => {
  it("erro comum: usa a mensagem e junta o código", () => {
    const erro = Object.assign(new Error("password authentication failed"), { code: "28P01" })
    expect(describeConnectionError(erro)).toBe("password authentication failed · 28P01")
  })

  it("AggregateError (IPv4/IPv6) tem mensagem vazia → usa os códigos de dentro", () => {
    const erro = new AggregateError([
      Object.assign(new Error(""), { code: "ENETUNREACH" }),
      Object.assign(new Error(""), { code: "ETIMEDOUT" }),
    ])
    expect(erro.message).toBe("")
    expect(describeConnectionError(erro)).toBe("ENETUNREACH · ETIMEDOUT")
  })

  it("não repete o mesmo código duas vezes", () => {
    const erro = new AggregateError([
      Object.assign(new Error(""), { code: "ECONNREFUSED" }),
      Object.assign(new Error(""), { code: "ECONNREFUSED" }),
    ])
    expect(describeConnectionError(erro)).toBe("ECONNREFUSED")
  })

  it("nunca devolve vazio, aconteça o que acontecer", () => {
    expect(describeConnectionError(new AggregateError([]))).not.toBe("")
    expect(describeConnectionError(undefined)).not.toBe("")
    expect(describeConnectionError("caiu")).not.toBe("")
  })
})
