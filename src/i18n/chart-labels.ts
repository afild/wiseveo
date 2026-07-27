import type { useTranslations } from "next-intl"

import {
  defaultAccounts,
  defaultCategories,
  defaultGroups,
} from "../../prisma/data/default-chart-of-accounts"

/**
 * Rotulos padrao do plano de contas traduzidos na EXIBICAO (decisao D9).
 *
 * O banco guarda a fonte em ingles (decisao D8, Tarefa 6B): `HOUSING`,
 * `Rent / Mortgage`, `Checking Account`... Este modulo resolve, na hora de
 * desenhar a tela, o rotulo do idioma ativo a partir do CODIGO estavel — mas
 * so quando o nome gravado ainda e o padrao. Nome que o usuario renomeou e
 * devolvido exatamente como ele digitou.
 *
 * REGRA: isto e camada de exibicao. Comparacoes, filtros de query e gravacoes
 * continuam usando o NOME DO BANCO (os matchers da Tarefa 6B).
 *
 * Recebe `t` por parametro (raiz do next-intl) para servir tanto o cliente
 * (`useTranslations()`) quanto o servidor (`await getTranslations()`).
 */
export type Translate = ReturnType<typeof useTranslations>

/**
 * Ponte de tipo: as chaves sao montadas em runtime a partir do codigo
 * (`chartOfAccounts.groups.${code}`), o que o TypeScript ve como `string`,
 * enquanto o Translator do next-intl so aceita a uniao literal de chaves.
 * O unico cast do modulo fica aqui, contido.
 */
function translate(t: Translate, key: string): string {
  return t(key as never)
}

/** Comparacao insensivel a caixa e a acento: "MORADIA" = "Moradia" = "moradia". */
function normalise(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

// Nomes legados em pt-BR (anteriores a Tarefa 6B). Mantidos SO para detectar
// "este nome ainda e o padrao?" em bases que nunca foram migradas — nao sao
// texto de UI e nunca sao exibidos.
const LEGACY_GROUP_NAMES: Record<number, string> = {
  100: "RECEITAS E RENDIMENTOS", // i18n-ignore
  200: "MORADIA", // i18n-ignore
  300: "ALIMENTAÇÃO", // i18n-ignore
  400: "TRANSPORTE", // i18n-ignore
  500: "SAÚDE", // i18n-ignore
  600: "LAZER E ESTILO DE VIDA", // i18n-ignore
  700: "EDUCAÇÃO", // i18n-ignore
  800: "OUTROS", // i18n-ignore
  900: "TRANSFERÊNCIAS", // i18n-ignore
}

const LEGACY_CATEGORY_NAMES: Record<string, string> = {
  "100.001": "Salário", // i18n-ignore
  "100.002": "Freelance / Serviços", // i18n-ignore
  "100.003": "Rendimentos", // i18n-ignore
  "200.001": "Aluguel / Prestação", // i18n-ignore
  "200.002": "Condomínio", // i18n-ignore
  "200.003": "Contas de Consumo (Luz/Água/Gás)", // i18n-ignore
  "200.004": "Internet / TV", // i18n-ignore
  "300.001": "Supermercado", // i18n-ignore
  "300.002": "Restaurantes / Delivery", // i18n-ignore
  "400.001": "Combustível", // i18n-ignore
  "400.002": "Transporte Público / Uber", // i18n-ignore
  "400.003": "Manutenção Veículo", // i18n-ignore
  "500.001": "Plano de Saúde / Farmácia", // i18n-ignore
  "600.001": "Cinema / Shows / Viagens", // i18n-ignore
  "600.002": "Assinaturas (Netflix, Spotify, etc.)", // i18n-ignore
  "700.001": "Cursos / Faculdade / Livros", // i18n-ignore
  "800.001": "Despesas Diversas", // i18n-ignore
  "800.002": "Impostos / Tarifas", // i18n-ignore
  "900.001": "Transferência entre Contas", // i18n-ignore
}

const LEGACY_ACCOUNT_NAMES: Record<string, string> = {
  CHECKING: "Conta Corrente", // i18n-ignore
  SAVINGS: "Reserva Financeira", // i18n-ignore
  WALLET: "Carteira", // i18n-ignore
}

/**
 * Grupos sao resolvidos por NOME -> codigo original, nunca por aritmetica no
 * codigo: em usuarios phantom/demo o codigo e `1_000_000 + slotOffset + code`
 * e o `slotOffset` (derivado do prefixo em hexadecimal) nao e persistido em
 * lugar nenhum — `code % 1000` devolveria um codigo errado silenciosamente.
 * Um nome que bate com um padrao E o padrao; um nome renomeado nao bate com
 * nenhum e cai no proprio nome customizado.
 */
const GROUP_CODE_BY_NAME = new Map<string, number>()
for (const group of defaultGroups) {
  GROUP_CODE_BY_NAME.set(normalise(group.name), group.code)
}
for (const [code, name] of Object.entries(LEGACY_GROUP_NAMES)) {
  GROUP_CODE_BY_NAME.set(normalise(name), Number(code))
}

const CATEGORY_CODE_BY_NAME = new Map<string, string>()
for (const category of defaultCategories) {
  CATEGORY_CODE_BY_NAME.set(normalise(category.name), category.code)
}
for (const [code, name] of Object.entries(LEGACY_CATEGORY_NAMES)) {
  CATEGORY_CODE_BY_NAME.set(normalise(name), code)
}

const ACCOUNT_TYPE_BY_NAME = new Map<string, string>()
for (const account of defaultAccounts) {
  ACCOUNT_TYPE_BY_NAME.set(normalise(account.name), account.type)
}
for (const [type, name] of Object.entries(LEGACY_ACCOUNT_NAMES)) {
  ACCOUNT_TYPE_BY_NAME.set(normalise(name), type)
}

/**
 * Codigos de categoria de usuarios phantom vem prefixados
 * ("d1a2b3c4.100.001"); o sufixo estavel sao os dois ultimos segmentos.
 */
function normalizeCategoryCode(code: string): string {
  const parts = code.split(".")
  return parts.length > 2 ? parts.slice(-2).join(".") : code
}

/** Rotulo do grupo: traduzido se ainda for o padrao, senao o nome customizado. */
export function resolveGroupLabel(t: Translate, group: { name: string }): string {
  const code = GROUP_CODE_BY_NAME.get(normalise(group.name))
  return code === undefined ? group.name : translate(t, `chartOfAccounts.groups.${code}`)
}

/**
 * Rotulo da categoria. Quando o codigo vem junto ele desempata: so traduz se o
 * nome gravado for o padrao DAQUELE codigo, para que uma categoria renomeada
 * com o nome de outra nao vire a traducao da outra. Sem codigo (a maioria das
 * telas so tem o nome em maos), a busca por nome basta.
 */
export function resolveCategoryLabel(
  t: Translate,
  category: { code?: string | null; name: string },
): string {
  const code = CATEGORY_CODE_BY_NAME.get(normalise(category.name))
  if (code === undefined) return category.name
  if (category.code && normalizeCategoryCode(category.code) !== code) return category.name

  // O next-intl trata "." como separador de nivel, e o codigo da categoria tem
  // um ponto ("400.003"). A chave da mensagem usa "_" no lugar; sem isso, o
  // lookup procuraria categories -> 400 -> 003 e devolveria a chave crua na tela.
  return translate(t, `chartOfAccounts.categories.${code.replace(".", "_")}`)
}

/** Rotulo da conta: traduzido se ainda for o padrao, senao o nome customizado. */
export function resolveAccountLabel(t: Translate, account: { name: string }): string {
  const type = ACCOUNT_TYPE_BY_NAME.get(normalise(account.name))
  return type === undefined ? account.name : translate(t, `chartOfAccounts.accounts.${type}`)
}

/**
 * Rotulo do status: SEMPRE pelo codigo. Os quatro status sao um lookup global
 * (`TransactionStatusLookup.code` e `@unique` no schema e usuarios phantom
 * reusam as mesmas linhas 1-4) e o usuario nao os renomeia.
 */
export function resolveStatusLabel(
  t: Translate,
  status: { code: number | string; name: string },
): string {
  const code = Number(status.code)
  return code >= 1 && code <= 4 ? translate(t, `chartOfAccounts.statuses.${code}`) : status.name
}
