/**
 * Guard de data fechada: a parte PURA (sem React, sem DOM).
 *
 * Quatro peças:
 * - `createGuardMachine`: guarda o token de override e o escopo do lote. É ela que faz um laço
 *   sequencial de N linhas pedir o PIN UMA vez só, e uma recusa valer para o lote inteiro.
 * - `createDateClosingInterceptor`: o handler de fetch (ordem 20 no host de src/lib/fetch-interceptors)
 *   montado sobre a máquina mais um "abridor de janela" injetado. O abridor é uma função assíncrona
 *   qualquer, então tudo aqui é testável sem montar componente nenhum.
 * - `createSerialDialogOpener` + `planQueuedDialog`: a FILA da janela (uma pergunta de cada vez) e a
 *   decisão de cada pedido quando chega a vez dele. Moraram dentro do componente e por isso não
 *   tinham teste; aqui não dependem de React e nenhuma escrita fica pendurada.
 * - `firstOpenDayKey` / `isClosedDay`: o piso de data para a janela de "escolher outra data".
 */
import {
  isEligibleWrite,
  withHeader,
  type FetchArgs,
  type FetchInterceptor,
} from "@/lib/fetch-interceptors"
import { addDays, isDayKey } from "./date-closing"
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

/**
 * Primeiro dia já fora do fechamento, ou null quando não há corte legível.
 * O campo de data da janela usa isto como piso: sem ele, escolher uma data que TAMBÉM está fechada
 * repetia a requisição por fora da cadeia de handlers, e a pessoa recebia um 423 cru com a janela
 * já fechada (beco sem saída).
 */
export function firstOpenDayKey(closedThrough: string | null): string | null {
  return closedThrough !== null && isDayKey(closedThrough) ? addDays(closedThrough, 1) : null
}

/** A data escolhida ainda cai dentro do período fechado? (chaves "YYYY-MM-DD" comparam como texto) */
export function isClosedDay(date: string, closedThrough: string | null): boolean {
  const floor = firstOpenDayKey(closedThrough)
  return floor !== null && date.length > 0 && date < floor
}

/** A mais tarde de duas chaves de dia (o corte do 423 e o do provider podem discordar por segundos). */
export function laterDayKey(a: string | null, b: string | null): string | null {
  if (a === null) return b
  if (b === null) return a
  return a >= b ? a : b
}

export interface QueuedDialogInput {
  /** O guard desmontou: nenhuma janela pode mais aparecer na tela. */
  disposed: boolean
  mode: DialogMode
  /** Token que o guard já tem em mãos, se alguém respondeu antes nesta fila. */
  heldToken: { token: string; expiresAt: string } | null
  /** O token em mãos nasceu DEPOIS que este pedido entrou na fila. */
  tokenIsNewer: boolean
  /** `machine.hasValidToken(agora)`. */
  tokenStillValid: boolean
  /** `machine.onLocked(agora)` reavaliado AGORA, na vez deste pedido. */
  lockedAction: "pass" | "retry" | "ask"
}

export type QueuedDialogPlan = { kind: "show" } | { kind: "resolved"; result: DialogResult }

/**
 * O que fazer com um pedido quando chega a vez dele na fila. Três saídas sem abrir janela:
 * - o guard desmontou (sem isto a escrita ficava pendurada para sempre, sem janela na tela);
 * - o token chegou enquanto este pedido esperava (não pergunta o PIN de novo);
 * - alguém JÁ RECUSOU neste lote (sem isto, duas escritas em paralelo abriam duas janelas para a
 *   mesma pergunta; a máquina é reconsultada aqui, não só antes de entrar na fila).
 */
export function planQueuedDialog(input: QueuedDialogInput): QueuedDialogPlan {
  if (input.disposed) return { kind: "resolved", result: { kind: "changeDate" } }
  if (input.mode === "pin" && input.heldToken !== null && input.tokenIsNewer && input.tokenStillValid) {
    return {
      kind: "resolved",
      result: { kind: "token", token: input.heldToken.token, expiresAt: input.heldToken.expiresAt },
    }
  }
  // "createPin" não é escrita: uma recusa de lote não tem por que impedir criar o PIN.
  if (input.mode !== "createPin" && input.lockedAction === "pass") {
    return { kind: "resolved", result: { kind: "changeDate" } }
  }
  return { kind: "show" }
}

export interface SerialDialogOpenerOptions {
  machine: GuardMachine
  /** Põe a janela na tela e resolve quando a pessoa responde. Chamada uma de cada vez. */
  show: (request: DialogRequest) => Promise<DialogResult>
  now?: () => number
}

export interface SerialDialogOpener {
  open: DialogOpener
  /** Guarda o token (na máquina e na fila) para quem ainda espera a vez. */
  keepToken(token: string, expiresAt: string): void
  /**
   * Liga a fila a uma tela viva e devolve o desmonte, que solta TODO mundo que espera e recusa
   * quem chegar depois. Religar é de propósito: o React em modo estrito monta, desmonta e remonta
   * os efeitos em desenvolvimento, e uma baixa definitiva deixaria o guard nascendo morto.
   */
  mount(): () => void
}

/**
 * Serializa a janela: duas escritas paralelas que voltem 423 entram numa fila e a segunda aproveita
 * a resposta da primeira. O desmonte de `mount` é o contrato que impede requisição pendurada: quem
 * está na tela e quem ainda espera a vez recebem "alterar a data", e quem chegar depois nem cria
 * promessa (senão a janela apareceria numa árvore que já saiu e ninguém a responderia nunca).
 */
export function createSerialDialogOpener({
  machine,
  show,
  now = Date.now,
}: SerialDialogOpenerOptions): SerialDialogOpener {
  let queue: Promise<unknown> = Promise.resolve()
  let held: { token: string; expiresAt: string } | null = null
  let generation = 0
  let disposed = false
  const waiting = new Set<(result: DialogResult) => void>()

  const open: DialogOpener = (request) => {
    const entered = generation
    const run = queue.then((): DialogResult | Promise<DialogResult> => {
      const plan = planQueuedDialog({
        disposed,
        mode: request.mode,
        heldToken: held,
        tokenIsNewer: generation !== entered,
        tokenStillValid: machine.hasValidToken(now()),
        lockedAction: machine.onLocked(now()),
      })
      if (plan.kind === "resolved") return plan.result
      return new Promise<DialogResult>((resolve) => {
        let done = false
        const finish: (result: DialogResult) => void = (result) => {
          if (done) return
          done = true
          waiting.delete(finish)
          resolve(result)
        }
        waiting.add(finish)
        // `show` não deveria rejeitar; se rejeitar, a recusa é a saída segura (nada pendurado).
        void show(request).then(finish, () => finish({ kind: "changeDate" }))
      })
    })
    queue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  return {
    open,
    keepToken: (token, expiresAt) => {
      machine.setToken(token, Date.parse(expiresAt))
      held = { token, expiresAt }
      generation += 1
    },
    mount: () => {
      disposed = false
      return () => {
        disposed = true
        const pending = [...waiting]
        waiting.clear()
        for (const finish of pending) finish({ kind: "changeDate" })
      }
    },
  }
}

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
