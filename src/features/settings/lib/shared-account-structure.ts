/**
 * Estrutura que a conta compartilhada (convites) exige do banco — e que o banco do
 * dono NÃO tem, por decisão dele: nada é criado no banco sem confirmação na tela.
 *
 * São duas peças, ambas ADITIVAS (nada é alterado, movido ou apagado):
 *   - `users.data_owner_id`: de quem são os dados que a pessoa vê. Vazio = dona de si.
 *   - tabela `invitations`: os convites em si (token, e-mail, prazo, uso, revogação).
 *
 * Módulo puro (sem banco) para a tela e os testes usarem os mesmos nomes.
 */

export const SHARED_ACCOUNT_COLUMN = "data_owner_id"
export const SHARED_ACCOUNT_TABLE = "invitations"

/** O que falta no banco, em nomes que a tela traduz (não são texto de UI). */
export type SharedAccountPiece = "column" | "table"

export interface SharedAccountStructure {
  /** Banco pronto para os convites. */
  ready: boolean
  missing: SharedAccountPiece[]
}

export function checkSharedAccountStructure(input: {
  hasColumn: boolean
  hasTable: boolean
}): SharedAccountStructure {
  const missing: SharedAccountPiece[] = []
  if (!input.hasColumn) missing.push("column")
  if (!input.hasTable) missing.push("table")
  return { ready: missing.length === 0, missing }
}
