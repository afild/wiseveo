import { describe, expect, it } from "vitest"
import { pgEnvFromUrl, resolveDumpUrl } from "../src/features/backup/lib/dump-url"

const POOLER_TX = "postgresql://postgres.abcdefghijklmnopqrst:p%40ss@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
const DIRECT = "postgresql://postgres:p%40ss@db.abcdefghijklmnopqrst.supabase.co:5432/postgres"

describe("resolveDumpUrl", () => {
  it("transaction pooler (6543) vira session pooler (5432), sem pgbouncer=true: pg_dump não funciona no modo transação", () => {
    expect(resolveDumpUrl({ DATABASE_URL: POOLER_TX })).toBe(
      "postgresql://postgres.abcdefghijklmnopqrst:p%40ss@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
    )
  })
  it("com DIRECT_URL e preferência pelo direto, usa o direto", () => {
    expect(resolveDumpUrl({ DATABASE_URL: POOLER_TX, DIRECT_URL: DIRECT }, true)).toBe(DIRECT)
  })
  it("sem preferência pelo direto, ignora DIRECT_URL e usa o session pooler", () => {
    expect(resolveDumpUrl({ DATABASE_URL: POOLER_TX, DIRECT_URL: DIRECT }, false)).toContain(":5432/")
    expect(resolveDumpUrl({ DATABASE_URL: POOLER_TX, DIRECT_URL: DIRECT }, false)).toContain("pooler.supabase.com")
  })
  it("sem DATABASE_URL, lança", () => {
    expect(() => resolveDumpUrl({})).toThrow()
  })
})

describe("pgEnvFromUrl", () => {
  it("quebra a URL em PG* e decodifica a senha", () => {
    expect(pgEnvFromUrl(DIRECT)).toEqual({
      PGHOST: "db.abcdefghijklmnopqrst.supabase.co",
      PGPORT: "5432",
      PGUSER: "postgres",
      PGPASSWORD: "p@ss",
      PGDATABASE: "postgres",
    })
  })
})
