import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * O interceptador de fetch (src/lib/fetch-interceptors.ts) só sabe repetir uma requisição
 * quando ela é descrita por (url, init) com corpo relido (string/FormData/URLSearchParams/Blob).
 * Duas formas escapam disso e não podem entrar no app:
 *   - passar um `Request` pronto (o corpo já foi consumido no primeiro envio);
 *   - mandar um `ReadableStream` como corpo (uma vez lido, acabou).
 * Hoje nenhum arquivo de src/ usa nenhuma das duas.
 *
 * As agulhas são EXPRESSÕES REGULARES tolerantes a espaço em branco, não pedaços de texto:
 * a chamada de fetch quebrada em duas linhas (o `new Request` indo para a linha de baixo) e o
 * corpo de stream com espaço sobrando depois dos dois-pontos passavam batido na comparação
 * literal antiga.
 *
 * E são montadas por PARTES de propósito: o padrão proibido nunca aparece inteiro em arquivo
 * nenhum (nem neste), então a varredura não se acha nem quando o padrão for citado em teste ou
 * comentário — e continua achando ocorrência de verdade. O teste abaixo prende essa propriedade.
 */
const AGULHAS = [
  { nome: "fetch(" + "new Request", re: new RegExp("fetch\\(\\s*" + "new\\s+Request") },
  { nome: "body: " + "new ReadableStream", re: new RegExp("body\\s*:\\s*" + "new\\s+ReadableStream") },
]

const RAIZ = path.resolve(__dirname, "..", "src")
const IGNORADOS = new Set(["generated", "node_modules"])
const ESTE_ARQUIVO = path.resolve(__filename)

function arquivosDeCodigo(dir: string): string[] {
  const achados: string[] = []
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const alvo = path.join(dir, entrada.name)
    if (entrada.isDirectory()) {
      if (IGNORADOS.has(entrada.name)) continue
      achados.push(...arquivosDeCodigo(alvo))
      continue
    }
    if (!/\.tsx?$/.test(entrada.name)) continue
    if (path.resolve(alvo) === ESTE_ARQUIVO) continue
    achados.push(alvo)
  }
  return achados
}

describe("varredura: nenhuma chamada que o interceptador não consiga repetir", () => {
  it("src/ não tem Request pronto nem corpo em stream", () => {
    const arquivos = arquivosDeCodigo(RAIZ)
    expect(arquivos.length).toBeGreaterThan(100)
    const ofensores: string[] = []
    for (const arquivo of arquivos) {
      const conteudo = readFileSync(arquivo, "utf8")
      for (const agulha of AGULHAS) {
        if (agulha.re.test(conteudo)) ofensores.push(`${path.relative(RAIZ, arquivo)}: ${agulha.nome}`)
      }
    }
    expect(ofensores).toEqual([])
  })
  it("a própria varredura não casa consigo mesma", () => {
    const conteudo = readFileSync(ESTE_ARQUIVO, "utf8")
    expect(AGULHAS.filter((agulha) => agulha.re.test(conteudo)).map((agulha) => agulha.nome)).toEqual([])
  })
})
