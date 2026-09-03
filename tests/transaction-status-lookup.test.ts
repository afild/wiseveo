import { beforeEach, describe, expect, it, vi } from "vitest"
import fs from "node:fs"
import path from "node:path"

/**
 * O catálogo de status (1 Paid, 2 Pending, 3 Overdue, 4 Scheduled) é um lookup
 * GLOBAL: `code` é `@unique` na base inteira e os lançamentos de todo mundo
 * apontam para as mesmas quatro linhas por chave estrangeira. O `user_id` da
 * linha é só o dono de referência.
 *
 * Filtrar essa leitura por usuário devolve lista vazia para quem não é o dono da
 * vez: na demo, toda cópia de visitante ficava sem status no formulário de novo
 * lançamento e o envio morria calado; com cadastro público, é o PRIMEIRO usuário
 * real que perde a lista quando o segundo se cadastra.
 *
 * Estes testes existem para que ninguém "conserte" o que não está quebrado
 * recolocando o filtro.
 */
const m = vi.hoisted(() => ({
  statusFindManyArgs: [] as unknown[],
  statusFindFirstArgs: [] as unknown[],
}))

vi.mock("@/lib/prisma", () => {
  const client = {
    transactionStatusLookup: {
      findMany: async (args: unknown) => {
        m.statusFindManyArgs.push(args)
        return [
          { id: "s3", code: 3, name: "Overdue" },
          { id: "s1", code: 1, name: "Paid" },
          { id: "s2", code: 2, name: "Pending" },
          { id: "s4", code: 4, name: "Scheduled" },
        ]
      },
      findFirst: async (args: unknown) => {
        m.statusFindFirstArgs.push(args)
        return { code: 2 }
      },
    },
    account: {
      findMany: async () => [{ id: 1, name: "Checking" }],
      findFirst: async () => ({ id: 1 }),
    },
    categoryGroup: { findMany: async () => [] },
    category: { findMany: async () => [] },
    payee: { findMany: async () => [] },
  }
  return { prisma: client }
})
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }))
vi.mock("@/lib/data-owner", () => ({ resolveDataOwnerId: async () => "dono" }))

import {
  findTransactionStatusByCode,
  listTransactionStatuses,
} from "@/features/transactions/services/transaction-status-lookup"
import { getFormOptions } from "@/features/transactions/services/get-form-options"
import { getQuickPaymentOptions } from "@/features/settings/services/user-settings-service"

/** Achata o `where` que chegou ao Prisma e responde se alguém mandou dono junto. */
function mentionsUser(args: unknown): boolean {
  const where = (args as { where?: unknown } | undefined)?.where
  if (!where) return false
  return JSON.stringify(where).toLowerCase().includes("userid")
}

beforeEach(() => {
  m.statusFindManyArgs = []
  m.statusFindFirstArgs = []
})

describe("leitura do catálogo de status", () => {
  it("listar não filtra por usuário", async () => {
    await listTransactionStatuses()

    expect(m.statusFindManyArgs).toHaveLength(1)
    expect(mentionsUser(m.statusFindManyArgs[0])).toBe(false)
    expect((m.statusFindManyArgs[0] as { where?: unknown }).where).toBeUndefined()
  })

  it("listar mantém a ordem por nome e os campos que a tela já usava", async () => {
    await listTransactionStatuses()

    expect(m.statusFindManyArgs[0]).toMatchObject({
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    })
  })

  it("buscar pelo código filtra SÓ pelo código", async () => {
    await findTransactionStatusByCode(2)

    expect(m.statusFindFirstArgs).toHaveLength(1)
    expect((m.statusFindFirstArgs[0] as { where?: unknown }).where).toEqual({ code: 2 })
    expect(mentionsUser(m.statusFindFirstArgs[0])).toBe(false)
  })
})

describe("telas que dependem do catálogo", () => {
  it("o formulário de lançamento recebe os quatro status de qualquer usuário", async () => {
    const options = await getFormOptions("visitante-da-demo")

    expect(options.statuses.map((s) => s.code).sort()).toEqual([1, 2, 3, 4])
    expect(mentionsUser(m.statusFindManyArgs[0])).toBe(false)
  })

  it("o pagamento rápido lista status sem olhar o dono da conta", async () => {
    const options = await getQuickPaymentOptions("visitante-da-demo")

    expect(options.statuses).toEqual([
      { code: 3, name: "Overdue" },
      { code: 1, name: "Paid" },
      { code: 2, name: "Pending" },
      { code: 4, name: "Scheduled" },
    ])
    expect(mentionsUser(m.statusFindManyArgs[0])).toBe(false)
  })
})

/**
 * A guarda de código: o catálogo só pode ser lido pelo módulo compartilhado. Sem
 * isto, um leitor novo nasceria com `where: { userId }` e o bug voltaria por uma
 * porta diferente da que estes testes vigiam.
 */
describe("quem pode falar com a tabela de status", () => {
  const ROOT = path.resolve(__dirname, "..")
  const ALLOWED = [
    // O módulo compartilhado é a leitura oficial.
    "src/features/transactions/services/transaction-status-lookup.ts",
    // Semeadura das quatro linhas (upsert por `code`, nunca por usuário).
    "src/lib/user-init.ts",
    // Cópia da demo: lê pelo código dentro da própria transação de criação.
    "src/features/demo/services/provision-demo-visitor.service.ts",
  ]

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === "generated") continue
        walk(full, out)
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        out.push(full)
      }
    }
    return out
  }

  it("nenhum outro arquivo do app toca transactionStatusLookup", () => {
    const offenders = walk(path.join(ROOT, "src"))
      .filter((file) => fs.readFileSync(file, "utf8").includes("transactionStatusLookup."))
      .map((file) => path.relative(ROOT, file).split(path.sep).join("/"))
      .filter((file) => !ALLOWED.includes(file))

    expect(offenders).toEqual([])
  })

  it("o módulo compartilhado não menciona userId", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/features/transactions/services/transaction-status-lookup.ts"),
      "utf8",
    )
    const code = source.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")

    expect(code).not.toContain("userId")
  })
})
