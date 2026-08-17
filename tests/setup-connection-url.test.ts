import { describe, expect, it } from "vitest"
import {
  buildConnectionUrl,
  composeConnectionUrl,
  detectProvider,
  detectProviderFromUrl,
  generateDbPassword,
  hasPasswordPlaceholder,
  normalizeConnectionUrl,
  parseConnectionUrl,
  redactConnectionUrl,
} from "../src/features/setup/lib/connection-url"

const SUPABASE_POOLER =
  "postgresql://postgres.abcdefghijklmnopqrst:[YOUR-PASSWORD]@aws-1-us-east-1.pooler.supabase.com:6543/postgres"

describe("normalizeConnectionUrl", () => {
  it("remove espaços, quebras de linha e aspas de colagens", () => {
    expect(normalizeConnectionUrl(`  "postgresql://u:p@h:5432/db"\n`)).toBe("postgresql://u:p@h:5432/db")
    expect(normalizeConnectionUrl("postgresql://u:p@\nh:5432/db")).toBe("postgresql://u:p@h:5432/db")
  })
})

describe("parseConnectionUrl", () => {
  it("lê a URL do pooler do Supabase com placeholder", () => {
    expect(parseConnectionUrl(SUPABASE_POOLER)).toEqual({
      protocol: "postgresql",
      user: "postgres.abcdefghijklmnopqrst",
      password: "[YOUR-PASSWORD]",
      host: "aws-1-us-east-1.pooler.supabase.com",
      port: "6543",
      database: "postgres",
      search: "",
    })
  })

  it("aceita postgres:// e query string", () => {
    const p = parseConnectionUrl("postgres://u:p@h/db?sslmode=require")
    expect(p?.protocol).toBe("postgres")
    expect(p?.port).toBeNull()
    expect(p?.database).toBe("db")
    expect(p?.search).toBe("?sslmode=require")
  })

  it("senha crua com @ não engana o parser (último @ separa o host)", () => {
    const p = parseConnectionUrl("postgresql://u:p@ss@h:1/db")
    expect(p?.password).toBe("p@ss")
    expect(p?.host).toBe("h")
  })

  it("rejeita o que não é URL de conexão", () => {
    expect(parseConnectionUrl("mysql://u:p@h/db")).toBeNull()
    expect(parseConnectionUrl("postgresql://")).toBeNull()
    expect(parseConnectionUrl("postgresql://u:p@h:abc/db")).toBeNull()
  })
})

describe("hasPasswordPlaceholder", () => {
  it("detecta [YOUR-PASSWORD], variantes e senha ausente", () => {
    expect(hasPasswordPlaceholder(SUPABASE_POOLER)).toBe(true)
    expect(hasPasswordPlaceholder("postgresql://u:%5BYOUR-PASSWORD%5D@h/db")).toBe(true)
    expect(hasPasswordPlaceholder("postgresql://u:<password>@h/db")).toBe(true)
    expect(hasPasswordPlaceholder("postgresql://u@h/db")).toBe(true)
    expect(hasPasswordPlaceholder("postgresql://u:@h/db")).toBe(true)
  })

  it("URL com senha real não é placeholder", () => {
    expect(hasPasswordPlaceholder("postgresql://u:s3cret@h/db")).toBe(false)
    expect(hasPasswordPlaceholder("não é url")).toBe(false)
  })
})

describe("buildConnectionUrl", () => {
  it("substitui o placeholder pela senha codificada (%, @, # e espaço)", () => {
    expect(buildConnectionUrl(SUPABASE_POOLER, "p%ss@w#rd 1")).toBe(
      "postgresql://postgres.abcdefghijklmnopqrst:p%25ss%40w%23rd%201@aws-1-us-east-1.pooler.supabase.com:6543/postgres",
    )
  })

  it("preserva query string e porta ausente", () => {
    expect(buildConnectionUrl("postgres://u:[YOUR-PASSWORD]@h/db?sslmode=require", "x")).toBe(
      "postgres://u:x@h/db?sslmode=require",
    )
  })

  it("sem senha digitada devolve a URL só normalizada", () => {
    expect(buildConnectionUrl("  postgresql://u:real@h:5432/db  ")).toBe("postgresql://u:real@h:5432/db")
    expect(buildConnectionUrl("postgresql://u:real@h:5432/db", "")).toBe("postgresql://u:real@h:5432/db")
  })

  it("com senha digitada, sobrescreve a que estava na URL", () => {
    expect(buildConnectionUrl("postgresql://u:old@h:5432/db", "new")).toBe("postgresql://u:new@h:5432/db")
  })
})

describe("composeConnectionUrl", () => {
  it("monta a URL do pooler a partir das partes", () => {
    expect(
      composeConnectionUrl({
        user: "postgres.ref",
        password: "a-b_C",
        host: "aws-1-sa-east-1.pooler.supabase.com",
        port: 6543,
        database: "postgres",
      }),
    ).toBe("postgresql://postgres.ref:a-b_C@aws-1-sa-east-1.pooler.supabase.com:6543/postgres")
  })
})

describe("detectProvider", () => {
  it("distingue Supabase direto, Supabase pooler, Neon e outros", () => {
    expect(detectProvider("db.abcdefghijklmnopqrst.supabase.co")).toBe("supabase-direct")
    expect(detectProvider("aws-0-eu-west-1.pooler.supabase.com")).toBe("supabase-pooler")
    expect(detectProvider("ep-cool-name-123456-pooler.us-east-2.aws.neon.tech")).toBe("neon")
    expect(detectProvider("localhost")).toBe("other")
    expect(detectProviderFromUrl(SUPABASE_POOLER)).toBe("supabase-pooler")
    expect(detectProviderFromUrl("lixo")).toBe("other")
  })
})

describe("redactConnectionUrl", () => {
  it("esconde a senha em qualquer texto, mantendo usuário e host", () => {
    const msg = `Error: connect to postgresql://postgres.ref:S3cr%40t@host.pooler.supabase.com:6543/postgres failed`
    expect(redactConnectionUrl(msg)).toBe(
      "Error: connect to postgresql://postgres.ref:***@host.pooler.supabase.com:6543/postgres failed",
    )
    expect(redactConnectionUrl(msg)).not.toContain("S3cr")
  })

  it("não altera texto sem URL com senha", () => {
    expect(redactConnectionUrl("password authentication failed for user \"postgres\"")).toBe(
      "password authentication failed for user \"postgres\"",
    )
    expect(redactConnectionUrl("postgresql://u@h/db")).toBe("postgresql://u@h/db")
  })
})

describe("generateDbPassword", () => {
  it("32 caracteres URL-safe, sem repetição entre chamadas", () => {
    const a = generateDbPassword()
    const b = generateDbPassword()
    expect(a).toHaveLength(32)
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(a).not.toBe(b)
    expect(encodeURIComponent(a)).toBe(a)
  })
})
