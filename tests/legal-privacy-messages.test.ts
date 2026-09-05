import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { PRIVACY_SECTION_IDS } from "../src/features/legal/lib/privacy-sections"
import { parseRichText } from "../src/features/legal/lib/rich-text"

/**
 * A página da política monta as chaves em tempo de execução (`sections.${id}.title`),
 * e o verificador `check:i18n:code` só confere chave escrita como texto literal. Ou
 * seja: uma seção faltando num idioma passaria pelos portões e explodiria na tela,
 * numa página pública que a tela de consentimento do Google aponta.
 *
 * Esta é a catraca que cobre esse buraco: a lista de seções do código e os três
 * arquivos de tradução têm de falar exatamente das mesmas seções, com o mesmo formato.
 */
const LOCALES = ["pt-BR", "en-US", "es-419"] as const
const MESSAGES_DIR = path.join(process.cwd(), "src/i18n/messages")

function load(locale: string) {
  return JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, `${locale}.json`), "utf-8"))
}

const messages = Object.fromEntries(LOCALES.map((l) => [l, load(l)])) as Record<string, Record<string, never>>

describe.each(LOCALES)("legal.privacy em %s", (locale) => {
  const legal = (messages[locale] as Record<string, unknown>).legal as Record<string, unknown>
  const privacy = legal?.privacy as Record<string, unknown>
  const sections = privacy?.sections as Record<string, { title?: string; body?: string }>

  it("tem o cabeçalho completo", () => {
    expect(typeof legal?.backHome).toBe("string")
    for (const key of ["title", "effectiveDate", "intro", "metaDescription"]) {
      expect(String(privacy?.[key] ?? "").length).toBeGreaterThan(0)
    }
  })

  it("tem exatamente as seções que a página desenha, sem faltar nem sobrar", () => {
    expect(Object.keys(sections).sort()).toEqual([...PRIVACY_SECTION_IDS].sort())
  })

  it.each(PRIVACY_SECTION_IDS)("a seção %s tem título e corpo com conteúdo", (id) => {
    expect(String(sections[id]?.title ?? "").trim().length).toBeGreaterThan(0)
    expect(parseRichText(String(sections[id]?.body ?? "")).length).toBeGreaterThan(0)
  })

  it("todo link do documento aponta para um endereço aceito", () => {
    for (const id of PRIVACY_SECTION_IDS) {
      const body = String(sections[id]?.body ?? "")
      const escritos = [...body.matchAll(/\[([^\]\n]+)\]\(([^)\s]+)\)/g)].length
      const virados = parseRichText(body)
        .flatMap((b) => (b.kind === "list" ? b.items.flat() : b.content))
        .filter((n) => n.kind === "link").length
      // Se um deles não virou link, o endereço foi recusado (esquema estranho ou erro
      // de digitação) e o leitor veria só o texto, sem destino.
      expect(`${id}: ${virados}/${escritos}`).toBe(`${id}: ${escritos}/${escritos}`)
    }
  })
})

describe("as três traduções contam a mesma história", () => {
  /**
   * Estrutura igual seção a seção: mesmo número de parágrafos e de listas, e listas com
   * o mesmo número de itens. É o que pega tradução que comeu um item da lista de
   * cookies ou um parágrafo inteiro, coisa que a contagem de chaves não vê.
   */
  it.each(PRIVACY_SECTION_IDS)("a seção %s tem a mesma forma nos três idiomas", (id) => {
    const forma = (locale: string) => {
      const body = String(
        (((messages[locale] as Record<string, never>).legal as Record<string, never>).privacy as Record<string, never>)
          ["sections" as never][id as never]["body" as never],
      )
      return parseRichText(body)
        .map((b) => (b.kind === "list" ? `lista(${b.items.length})` : "parágrafo"))
        .join(" ")
    }
    const referencia = forma("pt-BR")
    for (const locale of LOCALES) {
      expect(`${locale}: ${forma(locale)}`).toBe(`${locale}: ${referencia}`)
    }
  })
})
