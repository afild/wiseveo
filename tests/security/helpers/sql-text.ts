type SqlLike = { strings?: readonly string[]; values?: unknown[]; text?: string }
export function renderValue(value: unknown): string {
  if (value && typeof value === "object") {
    const v = value as SqlLike
    if (Array.isArray(v.strings)) return v.strings.reduce((acc, s, i) => acc + s + (i < (v.values?.length ?? 0) ? renderValue(v.values![i]) : ""), "")
    if (typeof v.text === "string") return v.text
  }
  return typeof value === "string" ? value : JSON.stringify(value)
}
/** Texto completo do template com os valores no lugar dos `${}` (só para asserções). */
export function sqlText(strings: TemplateStringsArray, values: unknown[]): string {
  return strings.reduce((acc, s, i) => acc + s + (i < values.length ? renderValue(values[i]) : ""), "")
}

/**
 * O mesmo, para `$queryRawUnsafe`/`$executeRawUnsafe`: troca cada `$n` pelo valor daquela posição,
 * para as asserções continuarem lendo a instrução como um texto só. `$ref` e `$.caminho` (jsonpath
 * dentro de literais do SQL) não casam com `$n` e ficam intactos.
 */
export function unsafeSqlText(query: string, values: unknown[]): string {
  return query.replace(/\$(\d+)/g, (whole, digits: string) => {
    const value = values[Number(digits) - 1]
    return value === undefined ? whole : renderValue(value)
  })
}

/**
 * GUARDA DE REGRESSÃO do transporte. Instrução tem de ser TEXTO puro e todo valor tem de ser
 * simples. Fragmento aninhado (`Prisma.sql`/`Prisma.raw`, reconhecível por ter `strings` e
 * `values`) só é emendado no SQL quando passa num `instanceof` contra a classe da cópia do cliente
 * Prisma que montou o template — e dentro do Next existe mais de uma cópia do módulo gerado. Falhou
 * o `instanceof`, o fragmento vira PARÂMETRO e o banco recebe `)$9` no lugar do `::jsonb`.
 */
export function assertPlainStatement(query: unknown, values: unknown[]): void {
  if (typeof query !== "string") {
    // i18n-ignore: mensagem de teste
    throw new Error(`instrução tem de ser texto puro, veio ${typeof query}`)
  }
  for (const [i, value] of values.entries()) {
    if (value !== null && (typeof value === "object" || typeof value === "function")) {
      // i18n-ignore: mensagem de teste
      throw new Error(`parâmetro $${i + 1} não é valor simples (fragmento SQL aninhado?): ${JSON.stringify(value)}`)
    }
  }
}
