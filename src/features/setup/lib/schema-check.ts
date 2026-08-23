/**
 * Colunas que ESTA versão do app exige na tabela `users` — nomes reais das colunas,
 * espelho do model `User` em prisma/schema.prisma. O teste
 * tests/setup-schema-check.test.ts falha se os dois divergirem.
 *
 * Por que só `users`: é a tabela que o Finalizar grava (upsert do administrador) e
 * que o login lê inteira — faltar coluna aqui quebra o primeiro acesso. As tabelas
 * financeiras seguem a regra de ouro (o schema é que se adapta ao banco do dono).
 */
export const REQUIRED_USERS_COLUMNS = [
  "id",
  "name",
  "email",
  "password_hash",
  "google_id",
  "phone",
  "photo",
  "preferences_json",
  "created_at",
  "updated_at",
  "themePreferences",
  "role",
  "status",
  "google_access_token",
  "google_refresh_token",
  "google_token_expires_at",
  "data_owner_id",
] as const

export interface SchemaCheck {
  ok: boolean
  missingColumns: string[]
}

export const SCHEMA_OK: SchemaCheck = { ok: true, missingColumns: [] }

/** Compara as colunas reais (information_schema) com as exigidas; sem diferenciar maiúsculas. */
export function checkUsersSchema(existingColumns: readonly string[]): SchemaCheck {
  const have = new Set(existingColumns.map((c) => c.toLowerCase()))
  const missingColumns = REQUIRED_USERS_COLUMNS.filter((c) => !have.has(c.toLowerCase()))
  return missingColumns.length === 0 ? SCHEMA_OK : { ok: false, missingColumns: [...missingColumns] }
}
