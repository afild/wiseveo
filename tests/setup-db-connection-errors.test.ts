import { describe, expect, it } from "vitest"
import { classifyConnectionError } from "../src/features/setup/services/db-connection.service"

const POOLER = "postgresql://postgres.ref:x@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
const DIRECT = "postgresql://postgres:x@db.abcdefghijklmnopqrst.supabase.co:5432/postgres"

/** Erros do `pg` viram códigos estáveis que a UI traduz em linguagem simples. */
describe("classifyConnectionError", () => {
  it("SQLSTATE de autenticação → invalidPassword", () => {
    expect(classifyConnectionError({ code: "28P01", message: "password authentication failed" }, POOLER)).toBe(
      "invalidPassword",
    )
    expect(classifyConnectionError({ message: "password authentication failed for user \"x\"" }, POOLER)).toBe(
      "invalidPassword",
    )
  })

  it("banco inexistente → dbNotFound; DNS → hostNotFound", () => {
    expect(classifyConnectionError({ code: "3D000" }, POOLER)).toBe("dbNotFound")
    expect(classifyConnectionError({ code: "ENOTFOUND" }, POOLER)).toBe("hostNotFound")
    expect(classifyConnectionError({ code: "EAI_AGAIN" }, POOLER)).toBe("hostNotFound")
  })

  it("rede inalcançável no host de conexão DIRETA do Supabase → ipv6Unreachable (dica do pooler)", () => {
    expect(classifyConnectionError({ code: "ENETUNREACH" }, DIRECT)).toBe("ipv6Unreachable")
    // AggregateError do Node (tentativas IPv4/IPv6) carrega os códigos em .errors
    expect(classifyConnectionError({ errors: [{ code: "ENETUNREACH" }, { code: "EHOSTUNREACH" }] }, DIRECT)).toBe(
      "ipv6Unreachable",
    )
  })

  it("rede inalcançável em outro host → timeout (não é o caso IPv6)", () => {
    expect(classifyConnectionError({ code: "ENETUNREACH" }, POOLER)).toBe("timeout")
    expect(classifyConnectionError({ code: "ETIMEDOUT" }, POOLER)).toBe("timeout")
    expect(classifyConnectionError({ message: "Connection terminated due to connection timeout" }, POOLER)).toBe(
      "timeout",
    )
  })

  it("SSL exigido → sslRequired; resto → unknown", () => {
    expect(classifyConnectionError({ message: "The server does not support SSL connections" }, POOLER)).toBe(
      "sslRequired",
    )
    expect(classifyConnectionError({ message: "Tenant or user not found" }, POOLER)).toBe("unknown")
    expect(classifyConnectionError(null, POOLER)).toBe("unknown")
  })
})
