import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  commands: [] as Array<{ cmd: string; args?: string[]; env?: Record<string, string>; sudo?: boolean }>,
  exit: {} as Record<string, number>,
  stopped: 0,
}))

vi.mock("@vercel/sandbox", () => ({
  Sandbox: {
    create: vi.fn(async () => ({
      runCommand: vi.fn(async (input: { cmd: string; args?: string[]; env?: Record<string, string>; sudo?: boolean }) => {
        m.commands.push(input)
        const code = m.exit[input.cmd] ?? 0
        return {
          exitCode: code,
          stdout: async () =>
            input.cmd === "pg_restore"
              ? "1; TABLE DATA public transactions\n"
              : input.cmd === "pg_dump" && input.args?.[0] === "--version"
                ? "pg_dump (PostgreSQL) 18.6"
                : "",
          stderr: async () => (code === 0 ? "" : "connection refused"),
        }
      }),
      readFileToBuffer: vi.fn(async () => Buffer.from("DUMP")),
      stop: vi.fn(async () => {
        m.stopped += 1
        return { activeCpuDurationMs: 10 }
      }),
    })),
  },
}))

import { runPgDumpInSandbox } from "@/features/backup/services/sandbox-dump.service"

const URL_OK = "postgresql://postgres.ref:s%40cret@aws-0-us-east-1.pooler.supabase.com:5432/postgres"

beforeEach(() => {
  m.commands = []
  m.exit = {}
  m.stopped = 0
})

describe("runPgDumpInSandbox", () => {
  it("instala o cliente com sudo, roda o pg_dump com a senha por env (nunca por argumento) e devolve arquivo, índice e versão", async () => {
    const out = await runPgDumpInSandbox({ databaseUrl: URL_OK })
    expect(out.dump.toString()).toBe("DUMP")
    expect(out.toc).toContain("TABLE DATA public transactions")
    expect(out.pgDumpVersion).toBe("pg_dump (PostgreSQL) 18.6")

    const installs = m.commands.filter((c) => c.cmd === "apt-get")
    expect(installs.every((c) => c.sudo === true)).toBe(true)
    const dump = m.commands.find((c) => c.cmd === "pg_dump" && c.args?.includes("--format=custom"))
    expect(dump?.env).toMatchObject({
      PGHOST: "aws-0-us-east-1.pooler.supabase.com",
      PGPORT: "5432",
      PGPASSWORD: "s@cret",
      PGSSLMODE: "require",
    })
    expect(JSON.stringify(dump?.args)).not.toContain("s@cret")
    expect(JSON.stringify(dump?.args)).not.toContain("postgresql://")
  })

  it("sempre para o sandbox, mesmo quando o pg_dump falha, e a falha vira dumpFailed sem a senha", async () => {
    m.exit.pg_dump = 1
    await expect(runPgDumpInSandbox({ databaseUrl: URL_OK })).rejects.toMatchObject({ code: "dumpFailed" })
    await expect(runPgDumpInSandbox({ databaseUrl: URL_OK })).rejects.not.toThrow("s@cret")
    expect(m.stopped).toBe(2)
  })

  it("falha na instalação vira sandboxFailed", async () => {
    m.exit["apt-get"] = 100
    await expect(runPgDumpInSandbox({ databaseUrl: URL_OK })).rejects.toMatchObject({ code: "sandboxFailed" })
    expect(m.stopped).toBe(1)
  })
})
