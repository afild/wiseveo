import { NextResponse } from "next/server"
import type { getTranslations } from "next-intl/server"

export const DATE_CLOSED_HEADER = "x-wiseveo-date-closed"
export const PIN_TOKEN_HEADER = "x-wiseveo-pin-token"

/** Tradutor do espaço "api" (mesma convenção de AgentTranslator em src/features/ai/types/agent.types.ts). */
export type ApiTranslator = Awaited<ReturnType<typeof getTranslations<"api">>>

/** Código interno (camelCase = chave de tradução api.security.<code>) → código no fio (contrato do desenho, seção 8). */
export const SECURITY_CODES = {
  closeWouldReopen: "CLOSE_WOULD_REOPEN",
  forbidden: "FORBIDDEN",
  invalidToday: "INVALID_TODAY",
  nothingToReopen: "NOTHING_TO_REOPEN",
  pinInvalid: "PIN_INVALID",
  pinLocked: "PIN_LOCKED",
  pinMismatch: "PIN_MISMATCH",
  pinNotSet: "PIN_NOT_SET",
  pinRequired: "PIN_REQUIRED",
  unpaidBlockers: "UNPAID_BLOCKERS",
} as const
export type SecurityCode = keyof typeof SECURITY_CODES

/** Erro tipado com status HTTP e código estável; a rota traduz por `api.security.<code>`. */
export class SecurityError extends Error {
  constructor(public readonly code: SecurityCode, public readonly status: number, public readonly extra?: Record<string, unknown>) {
    super(code) // i18n-ignore: código estável, a rota traduz
  }
}

export class DateClosedError extends Error {
  readonly code = "DATE_CLOSED"
  constructor(
    public readonly days: string[],
    public readonly periods: string[],
    public readonly closedThrough: string,
    public readonly canOverride: boolean,
  ) {
    super("DATE_CLOSED") // i18n-ignore: código estável, a rota traduz
  }
}

/**
 * As chaves `api.security.*` só nascem na Tarefa 10, e as mensagens são tipadas (ver
 * `src/i18n/types.d.ts`): sem este apelido o `tsc` recusa as duas chamadas abaixo. Mesmo atalho de
 * chave montada em tempo de execução já usado no código (`src/i18n/chart-labels.ts`), só que
 * apertado no tipo real da chave em vez de `as never`. Com a Tarefa 10 no lugar, os dois `as ApiKey`
 * podem sair: o `tsc` já resolve `security.${error.code}` como união de literais.
 */
type ApiKey = Parameters<ApiTranslator>[0]

/** Toda rota de escrita chama isto no topo do catch: 423 + cabeçalho + corpo legível por máquina. */
export function respondDateClosed(error: unknown, t: ApiTranslator): NextResponse | null {
  if (!(error instanceof DateClosedError)) return null
  return NextResponse.json(
    { error: t("security.dateClosed" as ApiKey), code: error.code, days: error.days, periods: error.periods, closedThrough: error.closedThrough, canOverride: error.canOverride },
    { status: 423, headers: { [DATE_CLOSED_HEADER]: "1" } },
  )
}

export function respondSecurityError(error: unknown, t: ApiTranslator): NextResponse | null {
  if (!(error instanceof SecurityError)) return null
  return NextResponse.json(
    // `extra` vem ANTES: espalhado depois, um `extra.code` (ou `extra.error`) trocaria em silêncio o
    // código estável de que o cliente depende. Os dois campos do contrato ganham sempre.
    { ...(error.extra ?? {}), error: t(`security.${error.code}` as ApiKey), code: SECURITY_CODES[error.code] },
    { status: error.status },
  )
}
