/**
 * Guard de data fechada: a parte PURA (sem React, sem DOM).
 *
 * Duas peças:
 * - `createGuardMachine`: guarda o token de override e o escopo do lote. É ela que faz um laço
 *   sequencial de N linhas pedir o PIN UMA vez só, e uma recusa valer para o lote inteiro.
 * - `createDateClosingInterceptor`: o handler de fetch (ordem 20 no host de src/lib/fetch-interceptors)
 *   montado sobre a máquina mais um "abridor de janela" injetado. O abridor é uma função assíncrona
 *   qualquer, então tudo aqui é testável sem montar componente nenhum.
 */
import {
  isEligibleWrite,
  withHeader,
  type FetchArgs,
  type FetchInterceptor,
} from "@/lib/fetch-interceptors"
import { DATE_CLOSED_HEADER, PIN_TOKEN_HEADER } from "./http"

export type Decision = "declined" | "token"

export interface GuardMachine {
  setToken(token: string, expiresAtMs: number): void
  hasValidToken(nowMs: number): boolean
  tokenValue(nowMs: number): string | null
  beginBatch(): void
  endBatch(): void
  /** O que fazer com um 423: "pass" (devolver a resposta original), "retry" (repetir com o token) ou "ask" (abrir a janela). */
  onLocked(nowMs: number): "pass" | "retry" | "ask"
  /** Registra a decisão tomada na janela (vale para o resto do lote, se houver lote). */
  decide(decision: Decision): void
}

export function createGuardMachine(): GuardMachine {
  let token: { value: string; expiresAtMs: number } | null = null
  let batch: { active: boolean; decision: Decision | null } = { active: false, decision: null }
  const valid = (nowMs: number) => token !== null && token.expiresAtMs > nowMs
  return {
    setToken: (value, expiresAtMs) => {
      token = { value, expiresAtMs }
    },
    hasValidToken: valid,
    tokenValue: (nowMs) => (valid(nowMs) ? token!.value : null),
    beginBatch: () => {
      batch = { active: true, decision: null }
    },
    endBatch: () => {
      batch = { active: false, decision: null }
    },
    onLocked: (nowMs) => {
      if (batch.active && batch.decision === "declined") return "pass"
      if (batch.active && batch.decision === "token" && valid(nowMs)) return "retry"
      return "ask"
    },
    decide: (decision) => {
      if (batch.active) batch.decision = decision
    },
  }
}

/** Modo da janela: pedir o PIN, escolher outra data (lançar recorrente) ou criar o PIN. */
export type DialogMode = "pin" | "chooseDate" | "createPin"

export interface DialogRequest {
  days: string[]
  periods: string[]
  closedThrough: string | null
  canOverride: boolean
  mode: DialogMode
}

export type DialogResult =
  | { kind: "changeDate" }
  /** `pinCreated` avisa que o PIN nasceu nesta janela (o provider precisa recarregar). */
  | { kind: "token"; token: string; expiresAt: string; pinCreated?: boolean }
  | { kind: "chooseDate"; date: string }
  | { kind: "pinCreated" }

/** Abre a janela e resolve com a decisão. NUNCA rejeita nem fica pendurada: fechar resolve "changeDate". */
export type DialogOpener = (request: DialogRequest) => Promise<DialogResult>

function defaultOrigin(): string {
  return typeof window !== "undefined" ? window.location.origin : ""
}

const LAUNCH_PATH_RE = /^\/api\/recurring-transactions\/[^/]+\/launch\/?$/

/**
 * POST em `/api/recurring-transactions/{id}/launch`, a única rota que o token NÃO destrava
 * (ela ignora o cabeçalho de propósito: repetiria o lançamento dentro do período fechado).
 * Por isso a janela dela oferece escolher outra data em vez do PIN.
 */
export function isLaunchRoute(args: FetchArgs, origin: string = defaultOrigin()): boolean {
  const [input, init] = args
  if (!(typeof input === "string" || input instanceof URL)) return false
  if ((init?.method ?? "GET").toUpperCase() !== "POST") return false
  let url: URL
  try {
    url = new URL(String(input), origin)
  } catch {
    return false
  }
  if (url.origin !== origin) return false
  return LAUNCH_PATH_RE.test(url.pathname)
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

/** Troca o corpo por `{ date }` em JSON, preservando o resto do init (método, credenciais). */
function withDateBody(args: FetchArgs, date: string): FetchArgs {
  const [input, init] = args
  const headers = new Headers(init?.headers)
  headers.set("Content-Type", "application/json")
  return [input, { ...(init ?? {}), headers, body: JSON.stringify({ date }) }]
}

export interface DateClosingInterceptorOptions {
  machine: GuardMachine
  open: DialogOpener
  origin?: string
}

/**
 * Handler de fetch do fechamento de datas (ordem 20 — a cerca da vitrine responde 409 na ordem 10 e
 * este nunca é alcançado lá). Só reage a 423 com o cabeçalho do contrato; qualquer outra resposta
 * passa intacta.
 */
export function createDateClosingInterceptor({
  machine,
  open,
  origin = defaultOrigin(),
}: DateClosingInterceptorOptions): FetchInterceptor {
  return {
    before: (args) => {
      if (!isEligibleWrite(args, origin)) return args
      const token = machine.tokenValue(Date.now())
      return token ? withHeader(args, PIN_TOKEN_HEADER, token) : args
    },
    after: async (response, args, tools) => {
      if (response.status !== 423 || response.headers.get(DATE_CLOSED_HEADER) !== "1") return null

      const action = machine.onLocked(Date.now())
      if (action === "pass") return null
      if (action === "retry") {
        const token = machine.tokenValue(Date.now())
        // O token pode ter vencido entre a decisão e aqui; nesse caso cai na janela.
        if (token) return tools.retry(withHeader(args, PIN_TOKEN_HEADER, token))
      }

      const payload = (await response
        .clone()
        .json()
        .catch(() => ({}))) as Record<string, unknown>

      const result = await open({
        days: asStringList(payload.days),
        periods: asStringList(payload.periods),
        closedThrough: typeof payload.closedThrough === "string" ? payload.closedThrough : null,
        canOverride: payload.canOverride === true,
        mode: isLaunchRoute(args, origin) ? "chooseDate" : "pin",
      })

      if (result.kind === "token") {
        machine.setToken(result.token, Date.parse(result.expiresAt))
        machine.decide("token")
        return tools.retry(withHeader(args, PIN_TOKEN_HEADER, result.token))
      }

      if (result.kind === "chooseDate") {
        return tools.retry(withDateBody(args, result.date))
      }

      // "changeDate" e "pinCreated" são recusas: criar o PIN sozinho não autoriza escrita nenhuma.
      machine.decide("declined")
      return null
    },
  }
}
