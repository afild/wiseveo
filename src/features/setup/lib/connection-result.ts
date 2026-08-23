import type { SchemaCheck } from "./schema-check"

/**
 * O que o teste de conexão devolve ao wizard (nunca a URL nem a senha).
 * Módulo puro (sem Node/pg) para client components poderem importar os tipos.
 */
export interface ExistingCategory {
  id: unknown
  code: unknown
  name: unknown
  type: unknown
}

export interface ExistingGroup {
  id: unknown
  code: unknown
  name: unknown
  type: unknown
  categories: ExistingCategory[]
}

export interface ExistingAccount {
  id: unknown
  name: unknown
  type: unknown
}

/** Usuário do banco cujo e-mail é o de quem está instalando. */
export interface DbOwner {
  id: string
  email: string
}

/** Conteúdo do banco pertencente ao dono (`user_id`), exatamente como foi lido. */
export interface ExistingChart {
  groups: ExistingGroup[]
  accounts: ExistingAccount[]
}

export interface DbAudit {
  accounts: number
  transactions: number
  categories: number
  groups: number
  existingChart: ExistingChart
}

/** Estado que o wizard guarda entre os passos depois de uma conexão bem-sucedida. */
export interface ConnectionResultSummary {
  hasData: boolean
  /** E-mail que o servidor procurou em `users` (identidade do primeiro acesso ou sessão). */
  lookupEmail: string | null
  /** Usuário do banco com o e-mail de quem instala; null = não existe lá (bloqueia). */
  owner: DbOwner | null
  /** Só quando não há dono: e-mails encontrados em `users`, para a pessoa se localizar. */
  knownEmails: string[]
  audit: DbAudit | null
  /** null = o servidor não informou (versão antiga): a tela não afirma nada; o Finalizar confere de novo. */
  schemaCheck: SchemaCheck | null
}
