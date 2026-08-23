import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Quem entrou por convite lança na conta do dono. O ponto delicado é o que fazer
 * quando a consulta falha: tolerar SÓ a coluna ausente. Engolir um banco instável
 * faria a pessoa gravar transações em nome dela — lançamentos que sumiriam de todas
 * as telas assim que o banco voltasse.
 */
const m = vi.hoisted(() => ({
  ownerRow: null as { data_owner_id: string | null } | null,
  selectError: null as Error | null,
  columnExists: true,
  affectedRows: 1,
  executed: [] as string[],
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join("?")
      if (sql.includes("information_schema.columns")) {
        return [{ count: BigInt(m.columnExists ? 1 : 0) }]
      }
      if (m.selectError) throw m.selectError
      if (sql.includes("SELECT id FROM users")) return [{ id: "dono" }, { id: "convidada" }]
      return m.ownerRow ? [m.ownerRow] : []
    }),
    $executeRaw: vi.fn(async (strings: TemplateStringsArray) => {
      m.executed.push(strings.join("?"))
      return m.affectedRows
    }),
  },
}))

import {
  listAccountMemberIds,
  resetDataOwnerColumnCache,
  resolveDataOwnerId,
  setDataOwner,
} from "@/lib/data-owner"

beforeEach(() => {
  m.ownerRow = null
  m.selectError = null
  m.columnExists = true
  m.affectedRows = 1
  m.executed = []
  resetDataOwnerColumnCache()
})

describe("resolveDataOwnerId", () => {
  it("sem dono gravado, a pessoa é dona de si", async () => {
    m.ownerRow = { data_owner_id: null }
    expect(await resolveDataOwnerId("pessoa-1")).toBe("pessoa-1")
  })

  it("com dono gravado, devolve o dono", async () => {
    m.ownerRow = { data_owner_id: "dono" }
    expect(await resolveDataOwnerId("pessoa-2")).toBe("dono")
  })

  it("coluna ainda não existe (banco não preparado) → cada um é dono de si", async () => {
    m.columnExists = false
    m.selectError = Object.assign(new Error("column data_owner_id does not exist"), { code: "P2010" })
    expect(await resolveDataOwnerId("pessoa-3")).toBe("pessoa-3")
  })

  it("banco instável com a coluna PRESENTE → o erro sobe, não vira 'dona de si'", async () => {
    m.columnExists = true
    m.selectError = Object.assign(new Error("Connection terminated unexpectedly"), { code: "P1017" })
    await expect(resolveDataOwnerId("pessoa-4")).rejects.toThrow("Connection terminated")
  })
})

describe("listAccountMemberIds", () => {
  it("devolve o dono e quem ele convidou", async () => {
    expect(await listAccountMemberIds("dono")).toEqual(["dono", "convidada"])
  })

  it("coluna ausente → só o dono; banco instável → erro sobe", async () => {
    m.columnExists = false
    m.selectError = new Error("column does not exist")
    expect(await listAccountMemberIds("dono")).toEqual(["dono"])

    resetDataOwnerColumnCache()
    m.columnExists = true
    m.selectError = new Error("timeout")
    await expect(listAccountMemberIds("dono")).rejects.toThrow("timeout")
  })
})

describe("setDataOwner", () => {
  it("aponta a pessoa para o dono", async () => {
    await setDataOwner("convidada", "dono")
    expect(m.executed[0]).toContain("UPDATE users SET data_owner_id")
  })

  it("se nenhuma linha foi atualizada, falha alto — o aceite inteiro é desfeito", async () => {
    m.affectedRows = 0
    await expect(setDataOwner("fantasma", "dono")).rejects.toThrow("data owner not set")
  })
})
