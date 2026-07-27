/**
 * Guarda de ambiente dos scripts que escrevem na base DEMO.
 *
 * Nenhum script deste conjunto pode rodar contra o banco errado. A conferência
 * é feita contra `DEMO_DB_REF` (o identificador do projeto no `.env.local`) em
 * vez de um valor escrito no código — o repositório é público e o identificador
 * do banco não precisa ir junto.
 *
 * FALHA FECHADA: sem `DEMO_DB_REF` configurada não há verificação possível, e
 * a ausência aborta em vez de liberar. Uma guarda que some quando a variável
 * falta não é guarda nenhuma.
 */
export function resolveDemoDatabaseUrl(): string {
  const url = process.env.DATABASE_URL ?? ""
  const ref = (process.env.DEMO_DB_REF ?? "").trim()

  if (!ref) {
    console.error(
      "ABORT: DEMO_DB_REF nao configurada. Defina no .env.local o identificador do projeto da base DEMO."
    )
    process.exit(1)
  }

  if (!url.includes(ref)) {
    console.error("ABORT: DATABASE_URL nao e a base DEMO (nao casa com DEMO_DB_REF).")
    process.exit(1)
  }

  return url
}
