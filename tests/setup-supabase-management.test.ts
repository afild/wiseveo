import { describe, expect, it, vi } from "vitest"
import {
  createSupabaseManagementClient,
  SupabaseManagementError,
  SUPABASE_API_BASE,
} from "../src/features/setup/services/supabase-management"

const TOKEN = "sbp_test_token_1234567890"

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

function clientWith(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => handler(url, init))
  return { client: createSupabaseManagementClient(TOKEN, fetchMock), fetchMock }
}

describe("createSupabaseManagementClient — cabeçalhos e corpos", () => {
  it("manda o token como Bearer e Accept JSON em toda chamada", async () => {
    const { client, fetchMock } = clientWith(() => jsonResponse(200, []))
    await client.listOrganizations()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${SUPABASE_API_BASE}/organizations`)
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
    expect((init?.headers as Record<string, string>).Accept).toBe("application/json")
  })

  it("createProject usa organization_slug, db_pass e region_selection (spec atual)", async () => {
    const { client, fetchMock } = clientWith(() => jsonResponse(201, { ref: "abcdefghijklmnopqrst", status: "COMING_UP" }))
    const out = await client.createProject({
      organizationSlug: "my-org",
      name: "wiseveo",
      dbPassword: "abcdefghijklmnopqrstuvwxyz012345",
      regionSelection: { type: "smartGroup", code: "americas" },
    })
    expect(out).toEqual({ ref: "abcdefghijklmnopqrst", status: "COMING_UP" })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${SUPABASE_API_BASE}/projects`)
    expect(init?.method).toBe("POST")
    expect(JSON.parse(String(init?.body))).toEqual({
      name: "wiseveo",
      organization_slug: "my-org",
      db_pass: "abcdefghijklmnopqrstuvwxyz012345",
      region_selection: { type: "smartGroup", code: "americas" },
    })
  })

  it("updateDatabasePassword faz PATCH em /database/password", async () => {
    const { client, fetchMock } = clientWith(() => jsonResponse(200, { message: "ok" }))
    await client.updateDatabasePassword("abcdefghijklmnopqrst", "abcdefghijklmnopqrstuvwxyz012345")
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${SUPABASE_API_BASE}/projects/abcdefghijklmnopqrst/database/password`)
    expect(init?.method).toBe("PATCH")
    expect(JSON.parse(String(init?.body))).toEqual({ password: "abcdefghijklmnopqrstuvwxyz012345" })
  })
})

describe("createSupabaseManagementClient — respostas", () => {
  it("getAvailableRegions coloca a recomendação primeiro", async () => {
    const { client } = clientWith(() =>
      jsonResponse(200, {
        recommendations: {
          smartGroup: { name: "Americas", code: "americas", type: "smartGroup" },
          specific: [
            { name: "South America (São Paulo)", code: "sa-east-1" },
            { name: "East US (North Virginia)", code: "us-east-1" },
          ],
        },
      }),
    )
    const regions = await client.getAvailableRegions()
    expect(regions.recommended).toEqual({ type: "smartGroup", code: "americas", name: "Americas" })
    expect(regions.options.map((r) => r.code)).toEqual(["americas", "sa-east-1", "us-east-1"])
    expect(regions.options[1].type).toBe("specific")
  })

  it("getPoolerConfig escolhe o PRIMARY em transaction mode", async () => {
    const { client } = clientWith(() =>
      jsonResponse(200, [
        {
          identifier: "x",
          database_type: "READ_REPLICA",
          db_user: "postgres.rr",
          db_host: "rr.pooler.supabase.com",
          db_port: 6543,
          db_name: "postgres",
          pool_mode: "transaction",
        },
        {
          identifier: "y",
          database_type: "PRIMARY",
          db_user: "postgres.abcdefghijklmnopqrst",
          db_host: "aws-1-sa-east-1.pooler.supabase.com",
          db_port: 6543,
          db_name: "postgres",
          pool_mode: "transaction",
        },
      ]),
    )
    expect(await client.getPoolerConfig("abcdefghijklmnopqrst")).toEqual({
      dbUser: "postgres.abcdefghijklmnopqrst",
      dbHost: "aws-1-sa-east-1.pooler.supabase.com",
      dbPort: 6543,
      dbName: "postgres",
      poolMode: "transaction",
    })
  })
})

describe("createSupabaseManagementClient — erros viram códigos estáveis", () => {
  const expectCode = async (status: number, body: unknown, code: string) => {
    const { client } = clientWith(() => jsonResponse(status, body))
    const err = await client.listProjects().catch((e) => e)
    expect(err).toBeInstanceOf(SupabaseManagementError)
    expect((err as SupabaseManagementError).code).toBe(code)
    return err as SupabaseManagementError
  }

  it("401 → invalidToken; 429 → rateLimited; 402 → projectLimit", async () => {
    await expectCode(401, { message: "Unauthorized" }, "invalidToken")
    await expectCode(429, { message: "Too many requests" }, "rateLimited")
    await expectCode(402, { message: "Payment required" }, "projectLimit")
  })

  it("403 com mensagem de limite → projectLimit; 403 comum → forbidden", async () => {
    await expectCode(403, { message: "You have exceeded the free project limit" }, "projectLimit")
    await expectCode(403, { message: "Forbidden" }, "forbidden")
  })

  it("outros status → providerError; a mensagem de erro nunca carrega o token", async () => {
    const err = await expectCode(500, { message: "boom" }, "providerError")
    expect(err.message).not.toContain(TOKEN)
    expect(err.status).toBe(500)
  })
})
