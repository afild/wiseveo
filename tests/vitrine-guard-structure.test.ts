import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// Toda tabela com coluna user_id no schema precisa de gatilho no guard.
// Um model novo com user_id sem gatilho correspondente quebra este teste.
//
// A extração isola cada bloco "model X { ... }" pelo par de chaves (os models
// deste schema não têm chave aninhada nos campos, então a captura não-gulosa
// até o primeiro "\n}" fecha exatamente no fim do model). Feito assim — em vez
// de cortar o arquivo pelo texto de @@map como uma primeira versão fazia — para
// não vazar campos de um model anterior para dentro do bloco de um enum: um
// enum também tem `@@map(...)`, e cortar o arquivo por essa string pega o texto
// do model anterior (que pode ter user_id) junto, dando falso positivo.
describe("vitrine-guard.sql cobre todas as tabelas por dono", () => {
  it("uma trigger por tabela com user_id + users + transaction_attachments", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8")
    const guard = readFileSync("prisma/demo/vitrine-guard.sql", "utf8")
    const modelBlocks = [...schema.matchAll(/\nmodel\s+\w+\s*\{([\s\S]*?)\n\}/g)].map((m) => m[1])
    const comUserId = modelBlocks
      .map((bloco) => {
        const tabela = bloco.match(/@@map\("([^"]+)"\)/)?.[1]
        return tabela && bloco.includes('@map("user_id")') ? tabela : null
      })
      .filter((tabela): tabela is string => tabela !== null)
    expect(comUserId.length).toBeGreaterThanOrEqual(16)
    for (const tabela of [...comUserId, "users", "transaction_attachments"]) {
      expect(guard, `falta gatilho para ${tabela}`).toContain(`ON "${tabela}"`)
    }
  })
})
