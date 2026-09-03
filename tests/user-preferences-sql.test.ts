import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { assertPlainStatement } from "./security/helpers/sql-text"
import {
  bumpPinFailure,
  mergeUserPreferenceKey,
  setUserPreferenceKey,
  writeUserPreferenceKeys,
  type PreferencesExecutor,
} from "@/features/settings/services/user-preferences-write"

/**
 * Postgres DE VERDADE, dentro do processo (PGlite). O módulo que grava users.preferences_json é
 * quase todo SQL: asserção em cima do TEXTO da instrução não prova nada sobre o que o banco faz
 * com `||`, `jsonb_set` ou uma raiz escalar. Aqui roda o módulo publicado contra as duas formas da
 * coluna (jsonb e json, porque o banco pessoal do dono pode ser json) e cobra o RESULTADO.
 *
 * Nenhuma conexão externa: PGlite sobe em memória. Se não carregar (máquina sem WASM), o arquivo
 * inteiro é PULADO, nunca quebrado.
 */

type Rows<T> = { rows: T[] }
type PGliteLike = {
  query<T>(sql: string, params?: unknown[]): Promise<Rows<T>>
  close(): Promise<void>
}
type PGliteFactory = { create(): Promise<PGliteLike> }

let PGliteCtor: PGliteFactory | null = null
try {
  const mod = await import("@electric-sql/pglite")
  PGliteCtor = mod.PGlite as unknown as PGliteFactory
} catch {
  PGliteCtor = null
}
const describeWithDb = PGliteCtor ? describe : describe.skip

type Statement = { text: string; values: unknown[] }

/**
 * O executor entrega ao Postgres EXATAMENTE o que o módulo mandou: o texto e o array de valores,
 * sem nenhuma etapa de montagem no meio. A versão antiga tinha essa etapa (remontava o template do
 * Prisma) e era justamente ela que escondia o bug: dentro do Next não existe segunda montagem, e o
 * fragmento aninhado que aqui era emendado no texto lá virava parâmetro. `assertPlainStatement`
 * reprova qualquer volta desse formato.
 */
function makeExecutor(db: PGliteLike, log: Statement[]): PreferencesExecutor {
  const run = async (query: string, values: unknown[]) => {
    assertPlainStatement(query, values)
    log.push({ text: query, values: [...values] })
    const res = await db.query<Record<string, unknown>>(query, [...values])
    return res.rows
  }
  return {
    $queryRawUnsafe: (query: string, ...values: unknown[]) => run(query, values),
  } as unknown as PreferencesExecutor
}

const updates = (log: Statement[]) => log.filter((s) => s.text.includes("UPDATE users"))

for (const columnType of ["jsonb", "json"] as const) {
  describeWithDb(`SQL real (PGlite) — coluna ${columnType}`, () => {
    let db: PGliteLike
    let ex: PreferencesExecutor
    const log: Statement[] = []

    beforeAll(async () => {
      db = await PGliteCtor!.create()
      await db.query(`CREATE TABLE users (id text PRIMARY KEY, preferences_json ${columnType})`)
      ex = makeExecutor(db, log)
    })
    afterAll(async () => {
      await db?.close()
    })

    /** Semeia a linha com um literal JSON cru (ou NULL do SQL). */
    async function seed(id: string, raw: string | null) {
      await db.query(`DELETE FROM users WHERE id = $1`, [id])
      await db.query(
        raw === null
          ? `INSERT INTO users (id, preferences_json) VALUES ($1, NULL)`
          : `INSERT INTO users (id, preferences_json) VALUES ($1, $2::${columnType})`,
        raw === null ? [id] : [id, raw],
      )
      log.length = 0
    }
    async function prefs(id: string): Promise<Record<string, unknown> | null> {
      const r = await db.query<{ p: Record<string, unknown> | null }>(
        `SELECT preferences_json::jsonb AS p FROM users WHERE id = $1`,
        [id],
      )
      return r.rows[0]?.p ?? null
    }
    async function rootType(id: string): Promise<string | null> {
      const r = await db.query<{ t: string | null }>(
        `SELECT jsonb_typeof(preferences_json::jsonb) AS t FROM users WHERE id = $1`,
        [id],
      )
      return r.rows[0]?.t ?? null
    }

    const ROOTS: Array<[string, string | null]> = [
      ["NULL do SQL", null],
      ["objeto normal", `{"locale":"pt-BR"}`],
      ["JSON null", `null`],
      ["escalar", `42`],
      ["array", `[1,2]`],
    ]
    const CALLS: Array<[string, (id: string) => Promise<unknown>]> = [
      ["mergeUserPreferenceKey", (id) => mergeUserPreferenceKey(ex, id, "dateClosing", { closedThrough: "2026-08-31" })],
      ["setUserPreferenceKey", (id) => setUserPreferenceKey(ex, id, "locale", "en-US")],
      ["writeUserPreferenceKeys", (id) => writeUserPreferenceKeys(ex, id, [{ key: "a", value: 1 }])],
      ["bumpPinFailure", (id) => bumpPinFailure(ex, id, 5, 15)],
    ]

    describe("raiz corrompida nunca derruba a escrita", () => {
      for (const [rootName, raw] of ROOTS) {
        for (const [fnName, call] of CALLS) {
          it(`${fnName} com raiz ${rootName}: não estoura e a raiz termina objeto`, async () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
            try {
              await seed("root-user", raw)
              await expect(call("root-user")).resolves.not.toThrow()
              expect(await rootType("root-user")).toBe("object")
            } finally {
              warn.mockRestore()
            }
          })
        }
      }
    })

    describe("aviso quando a raiz vinha corrompida (I3)", () => {
      it("array na raiz: avisa uma vez, nomeando a função e o usuário, e ainda grava", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
        try {
          await seed("warn-user", `[1,2]`)
          await setUserPreferenceKey(ex, "warn-user", "locale", "en-US")
          expect(warn).toHaveBeenCalledTimes(1)
          const msg = String(warn.mock.calls[0]?.[0])
          expect(msg).toContain("setUserPreferenceKey")
          expect(msg).toContain("warn-user")
          expect(msg).toContain("array")
          expect(await prefs("warn-user")).toEqual({ locale: "en-US" })
        } finally {
          warn.mockRestore()
        }
      })
      it("as QUATRO avisam com raiz escalar", async () => {
        for (const [fnName, call] of CALLS) {
          const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
          try {
            await seed("warn-all", `42`)
            await call("warn-all")
            expect(warn, fnName).toHaveBeenCalledTimes(1)
            expect(String(warn.mock.calls[0]?.[0])).toContain(fnName)
          } finally {
            warn.mockRestore()
          }
        }
      })
      it("raiz objeto e raiz NULL do SQL não avisam (não havia nada a perder)", async () => {
        for (const raw of [`{"locale":"pt-BR"}`, null]) {
          const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
          try {
            await seed("quiet-user", raw)
            await setUserPreferenceKey(ex, "quiet-user", "locale", "en-US")
            expect(warn).not.toHaveBeenCalled()
          } finally {
            warn.mockRestore()
          }
        }
      })
    })

    describe("mergeUserPreferenceKey", () => {
      it("preserva as irmãs e os outros subcampos de dateClosing", async () => {
        await seed(
          "u-merge",
          `{"locale":"pt-BR","budgetOrder":["a"],"dateClosing":{"pinHash":"keep","closedThrough":"2026-08-31"}}`,
        )
        await mergeUserPreferenceKey(ex, "u-merge", "dateClosing", { pinFailures: { count: 0, lockedUntil: null } })
        expect(await prefs("u-merge")).toEqual({
          locale: "pt-BR",
          budgetOrder: ["a"],
          dateClosing: {
            pinHash: "keep",
            closedThrough: "2026-08-31",
            pinFailures: { count: 0, lockedUntil: null },
          },
        })
      })
      it("chave que não era objeto vira o patch inteiro, sem concatenar", async () => {
        await seed("u-merge2", `{"dateClosing":"lixo"}`)
        await mergeUserPreferenceKey(ex, "u-merge2", "dateClosing", { pinHash: "novo" })
        expect(await prefs("u-merge2")).toEqual({ dateClosing: { pinHash: "novo" } })
      })
    })

    describe("setUserPreferenceKey", () => {
      it("troca a chave INTEIRA: o subcampo que sumiu do valor some do banco", async () => {
        await seed("u-set", `{"locale":"pt-BR","dateClosing":{"pinHash":"h","closedThrough":"2026-08-31"}}`)
        await setUserPreferenceKey(ex, "u-set", "dateClosing", { pinHash: null })
        expect(await prefs("u-set")).toEqual({ locale: "pt-BR", dateClosing: { pinHash: null } })
      })
      it("array continua array (não vira concatenação)", async () => {
        await seed("u-set2", `{"budgetOrder":["a","b"]}`)
        await setUserPreferenceKey(ex, "u-set2", "budgetOrder", ["c"])
        expect(await prefs("u-set2")).toEqual({ budgetOrder: ["c"] })
      })
    })

    describe("writeUserPreferenceKeys", () => {
      it("grava as DUAS chaves numa única instrução", async () => {
        await seed("u-multi", `{"locale":"pt-BR"}`)
        await writeUserPreferenceKeys(ex, "u-multi", [
          { key: "budgetFormula", value: { x: 1 } },
          { key: "budgetOrder", value: [] },
        ])
        expect(updates(log).length).toBe(1)
        expect(await prefs("u-multi")).toEqual({ locale: "pt-BR", budgetFormula: { x: 1 }, budgetOrder: [] })
      })
    })

    describe("bumpPinFailure", () => {
      it("cinco chamadas seguidas contam 1..5, armam o bloqueio no 5º e não tocam no pinHash", async () => {
        await seed("u-pin", `{"locale":"pt-BR","dateClosing":{"pinHash":"segredo","closedThrough":"2026-08-31"}}`)
        const now = new Date("2026-09-02T12:00:00.000Z")
        const seen: Array<{ count: number; lockedUntil: string | null }> = []
        for (let i = 0; i < 5; i++) seen.push(await bumpPinFailure(ex, "u-pin", 5, 15, now))
        expect(seen.map((s) => s.count)).toEqual([1, 2, 3, 4, 5])
        expect(seen.slice(0, 4).map((s) => s.lockedUntil)).toEqual([null, null, null, null])
        expect(seen[4].lockedUntil).toBe("2026-09-02T12:15:00.000Z")
        const after = await prefs("u-pin")
        expect((after?.dateClosing as Record<string, unknown>).pinHash).toBe("segredo")
        expect((after?.dateClosing as Record<string, unknown>).closedThrough).toBe("2026-08-31")
        expect(after?.locale).toBe("pt-BR")
      })
      /**
       * Expiração decidida DENTRO da instrução travada. Antes quem chamava lia a linha sem trava e
       * mandava um UPDATE só para zerar: `zera₁, conta₁, zera₂, conta₂, …` prendia o contador em 1 e
       * o número de palpites de graça virava o paralelismo do atacante. Aqui a mesma instrução que
       * incrementa é a que resolve o bloqueio vencido.
       */
      const NOW = new Date("2026-09-02T12:00:00.000Z")
      const PAST = `"2026-09-02T11:59:59.999Z"`
      const FUTURE = `"2026-09-02T12:00:00.001Z"`
      const seedFailures = (id: string, count: number, lockedUntil: string) =>
        seed(id, `{"dateClosing":{"pinHash":"segredo","pinFailures":{"count":${count},"lockedUntil":${lockedUntil}}}}`)

      it("bloqueio VENCIDO reinicia o contador na própria instrução: 5 vira 1 e o lockedUntil velho sai", async () => {
        await seedFailures("u-exp", 5, PAST)
        expect(await bumpPinFailure(ex, "u-exp", 5, 15, NOW)).toEqual({ count: 1, lockedUntil: null })
        expect(updates(log).length).toBe(1)
        const dc = (await prefs("u-exp"))?.dateClosing as Record<string, unknown>
        expect(dc.pinFailures).toEqual({ count: 1, lockedUntil: null })
        expect(dc.pinHash).toBe("segredo")
      })
      it("bloqueio AINDA DE PÉ só incrementa e rearma: quem recusa cedo é quem chama, não o SQL", async () => {
        await seedFailures("u-live", 5, FUTURE)
        expect(await bumpPinFailure(ex, "u-live", 5, 15, NOW)).toEqual({
          count: 6,
          lockedUntil: "2026-09-02T12:15:00.000Z",
        })
      })
      const UNPARSEABLE: Array<[string, string]> = [
        ["texto solto", `"soon"`],
        ["sem fuso (abortava o cast)", `"2026-09-02T12:00:00"`],
        ["data impossível", `"2026-02-31T00:00:00.000Z"`],
        ["número no lugar do instante", `7`],
      ]
      for (const [name, raw] of UNPARSEABLE) {
        it(`lockedUntil ${name} não aborta a instrução e vale como bloqueio vencido`, async () => {
          await seedFailures(`u-bad-lock-${name.slice(0, 4)}`, 5, raw)
          const res = await bumpPinFailure(ex, `u-bad-lock-${name.slice(0, 4)}`, 5, 15, NOW)
          expect(res).toEqual({ count: 1, lockedUntil: null })
        })
      }
      it("depois de vencer, cinco tentativas seguidas rearmam o bloqueio EXATAMENTE na quinta", async () => {
        await seedFailures("u-again", 5, PAST)
        const seen: Array<{ count: number; lockedUntil: string | null }> = []
        for (let i = 0; i < 5; i++) seen.push(await bumpPinFailure(ex, "u-again", 5, 15, NOW))
        expect(seen.map((s) => s.count)).toEqual([1, 2, 3, 4, 5])
        expect(seen.map((s) => s.lockedUntil)).toEqual([null, null, null, null, "2026-09-02T12:15:00.000Z"])
      })
      it("sem lockedUntil nenhum, o contador NÃO reinicia (é assim que 1,2,3,4 se acumulam)", async () => {
        await seed("u-nolock", `{"dateClosing":{"pinFailures":{"count":3,"lockedUntil":null}}}`)
        expect((await bumpPinFailure(ex, "u-nolock", 5, 15, NOW)).count).toBe(4)
        await seed("u-nolock2", `{"dateClosing":{"pinFailures":{"count":3}}}`)
        expect((await bumpPinFailure(ex, "u-nolock2", 5, 15, NOW)).count).toBe(4)
      })
      const BAD: Array<[string, string, number]> = [
        ["texto", `"abc"`, 1],
        ["decimal", `1.5`, 2],
        ["negativo", `-3`, 1],
        ["número gigante", `1e30`, 1000001],
      ]
      for (const [name, raw, expected] of BAD) {
        it(`contador guardado como ${name} ainda conta (${expected}) e não aborta`, async () => {
          await seed("u-bad", `{"dateClosing":{"pinHash":"h","pinFailures":{"count":${raw}}}}`)
          const res = await bumpPinFailure(ex, "u-bad", 5, 15)
          expect(res.count).toBe(expected)
          expect(((await prefs("u-bad"))?.dateClosing as Record<string, unknown>).pinHash).toBe("h")
        })
      }
    })

    describe("linha inexistente", () => {
      it("as QUATRO lançam com a mesma mensagem", async () => {
        await db.query(`DELETE FROM users WHERE id = $1`, ["fantasma"])
        for (const [fnName, call] of CALLS) {
          await expect(call("fantasma"), fnName).rejects.toThrow("preferences not written for fantasma")
        }
      })
    })

    describe("valor não serializável vira null, nunca some (I1)", () => {
      it("writeUserPreferenceKeys grava a chave de valor função como null (antes ela sumia)", async () => {
        await seed("u-i1", `{}`)
        await writeUserPreferenceKeys(ex, "u-i1", [
          { key: "callback", value: () => 1 },
          { key: "ok", value: 2 },
        ])
        expect(await prefs("u-i1")).toEqual({ callback: null, ok: 2 })
      })
      it("setUserPreferenceKey com o MESMO valor grava o mesmo null (simetria)", async () => {
        await seed("u-i1b", `{}`)
        await setUserPreferenceKey(ex, "u-i1b", "callback", () => 1)
        expect(await prefs("u-i1b")).toEqual({ callback: null })
      })
      it("campo interno undefined/símbolo continua no patch do merge", async () => {
        await seed("u-i1c", `{"dateClosing":{"pinHash":"keep"}}`)
        await mergeUserPreferenceKey(ex, "u-i1c", "dateClosing", {
          closedThrough: undefined,
          note: Symbol("x"),
          pinUpdatedAt: "2026-09-02",
        })
        expect(await prefs("u-i1c")).toEqual({
          dateClosing: { pinHash: "keep", closedThrough: null, note: null, pinUpdatedAt: "2026-09-02" },
        })
      })
      it("valor undefined dentro de array vira null e o array segue array", async () => {
        await seed("u-i1d", `{}`)
        await setUserPreferenceKey(ex, "u-i1d", "budgetOrder", ["a", undefined, "b"])
        expect(await prefs("u-i1d")).toEqual({ budgetOrder: ["a", null, "b"] })
      })
    })

    describe("patch do merge protegido dos dois lados (I2)", () => {
      it("patch array é recusado no TypeScript e dateClosing fica intacto", async () => {
        await seed("u-i2", `{"dateClosing":{"pinHash":"keep"}}`)
        await expect(
          mergeUserPreferenceKey(ex, "u-i2", "dateClosing", [1, 2] as unknown as Record<string, unknown>),
        ).rejects.toThrow("preferences patch must be an object for u-i2")
        expect(await prefs("u-i2")).toEqual({ dateClosing: { pinHash: "keep" } })
        expect(updates(log).length).toBe(0)
      })
      it("mesmo entrando array no PARÂMETRO, a instrução publicada não concatena", async () => {
        await seed("u-i2b", `{"dateClosing":{"pinHash":"keep"}}`)
        await mergeUserPreferenceKey(ex, "u-i2b", "dateClosing", { closedThrough: "2026-08-31" })
        const stmt = updates(log).at(-1)!
        const patchJson = JSON.stringify({ closedThrough: "2026-08-31" })
        const hijacked = stmt.values.map((v) => (v === patchJson ? "[1,2]" : v))
        expect(hijacked).not.toEqual(stmt.values)
        await db.query(stmt.text, hijacked)
        const after = await prefs("u-i2b")
        expect(Array.isArray(after?.dateClosing)).toBe(false)
        expect(after?.dateClosing).toEqual({ pinHash: "keep", closedThrough: "2026-08-31" })
      })
    })

    it(`a coluna continua ${columnType} depois das escritas`, async () => {
      await seed("u-type", `{}`)
      await setUserPreferenceKey(ex, "u-type", "locale", "en-US")
      await mergeUserPreferenceKey(ex, "u-type", "dateClosing", { pinHash: "h" })
      await writeUserPreferenceKeys(ex, "u-type", [{ key: "a", value: 1 }])
      await bumpPinFailure(ex, "u-type", 5, 15)
      const r = await db.query<{ data_type: string }>(
        `SELECT data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'preferences_json'`,
      )
      expect(r.rows[0].data_type).toBe(columnType)
    })
  })
}
