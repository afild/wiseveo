/**
 * Fechamento de datas: as DECISÕES do switch do "Registro de Transações", puras (sem React,
 * sem DOM, sem rede). Os componentes só desenham o que sai daqui.
 *
 * O estado da tabela da seção 7 continua em `computeSwitchState` (date-closing.ts); este módulo
 * cruza esse estado com quem está olhando (PIN definido, permissões) e com a resposta do
 * servidor, respondendo três perguntas: qual janela abre ao ligar, qual abre ao desligar, e
 * para onde vai a tela depois de cada resposta.
 */
import { isDayKey, type SwitchLabel, type SwitchState } from "./date-closing"

/** Os três booleanos da rota de estado que mudam o comportamento do switch. */
export interface ClosingPermissions {
  hasPin: boolean
  canManageClosing: boolean
  canManagePin: boolean
}

export type SwitchFlow =
  | { kind: "none" }
  | { kind: "confirmClose"; through: string }
  | { kind: "createPinThenClose"; through: string }
  | { kind: "reopen"; from: string }

/**
 * O que acontece ao mexer no switch. `none` é a resposta segura: estado ainda não carregado,
 * sem permissão, período no futuro, ou nada a fazer naquele sentido.
 */
export function decideSwitchToggle(input: {
  state: SwitchState | null
  next: boolean
  permissions: ClosingPermissions
}): SwitchFlow {
  const { state, next, permissions } = input
  if (state === null || state.disabled || !permissions.canManageClosing) return { kind: "none" }

  if (next) {
    if (state.closeTarget === null) return { kind: "none" }
    if (permissions.hasPin) return { kind: "confirmClose", through: state.closeTarget }
    // Fechar sem PIN não existe: o servidor devolve 428. Quem pode criar, cria antes.
    return permissions.canManagePin ? { kind: "createPinThenClose", through: state.closeTarget } : { kind: "none" }
  }

  if (state.reopenFrom === null) return { kind: "none" }
  // Reabrir exige token de PIN. Sem PIN, só quem pode criar segue: o próprio diálogo cria.
  if (!permissions.hasPin && !permissions.canManagePin) return { kind: "none" }
  return { kind: "reopen", from: state.reopenFrom }
}

export interface SwitchView {
  checked: boolean
  disabled: boolean
  /** Rótulo de estado (chave de `transactions.closing.state*`); null enquanto o estado não chegou. */
  label: SwitchLabel | null
  /** Data do corte que o rótulo `closedThrough` mostra. */
  labelDate: string | null
  /** Recado extra abaixo do rótulo. */
  note: "askOwnerPin" | null
}

/**
 * Aparência do switch. Enquanto o provider não respondeu (`state === null`) fica desabilitado e
 * MUDO de propósito: um rótulo chutado piscaria "aberto" num banco fechado.
 */
export function resolveSwitchView(input: {
  state: SwitchState | null
  closedThrough: string | null
  permissions: ClosingPermissions
}): SwitchView {
  const { state, closedThrough, permissions } = input
  if (state === null) return { checked: false, disabled: true, label: null, labelDate: null, note: null }

  // ADMIN convidado pode fechar, mas não pode criar o PIN: sem PIN, ele só informa e pede ao dono.
  const missingPin = permissions.canManageClosing && !permissions.hasPin && !permissions.canManagePin
  return {
    checked: state.checked,
    disabled: state.disabled || !permissions.canManageClosing || missingPin,
    label: state.label,
    labelDate: closedThrough,
    note: missingPin ? "askOwnerPin" : null,
  }
}

export type CloseOutcome = { kind: "success" } | { kind: "blockers" } | { kind: "createPin" } | { kind: "error" }

/** Destino da tela depois de `POST /api/security/date-closing/close`. */
export function decideCloseResponse(input: { ok: boolean; status: number; code?: unknown }): CloseOutcome {
  if (input.ok) return { kind: "success" }
  if (input.status === 409 && input.code === "UNPAID_BLOCKERS") return { kind: "blockers" }
  if (input.status === 428 && input.code === "PIN_NOT_SET") return { kind: "createPin" }
  return { kind: "error" }
}

/**
 * Data exibida no título/descrição da confirmação de fechamento (`AlertDialog` de
 * `DateClosingSwitch`). `closeThrough()` zera `confirmThrough` assim que a resposta chega, para
 * o diálogo começar a fechar — mas a animação de saída ainda leva um instante, e nesse
 * meio-tempo o texto não pode piscar com a data vazia ("Fechar lançamentos até ?"). Mantém o
 * último valor não nulo até a próxima abertura, quando um valor novo chega de verdade.
 */
export function retainConfirmThroughForDisplay(confirmThrough: string | null, previousDisplay: string | null): string | null {
  return confirmThrough ?? previousDisplay
}

export type ReopenOutcome = { kind: "success" } | { kind: "pinRequired" } | { kind: "error" }

/**
 * Destino da tela depois de `POST /api/security/date-closing/reopen`. O 401 é o caso em que o
 * diálogo NÃO pode fechar: o token venceu entre conferir o PIN e reabrir, e a pessoa digita de novo.
 */
export function decideReopenResponse(input: { ok: boolean; status: number; code?: unknown }): ReopenOutcome {
  if (input.ok) return { kind: "success" }
  if (input.status === 401 && input.code === "PIN_REQUIRED") return { kind: "pinRequired" }
  return { kind: "error" }
}

/** Como o diálogo de reabertura nasce: pedindo o PIN, criando um antes, ou travado. */
export function reopenDialogMode(permissions: ClosingPermissions): "pin" | "createPin" | "blocked" {
  if (!permissions.canManageClosing) return "blocked"
  if (permissions.hasPin) return "pin"
  return permissions.canManagePin ? "createPin" : "blocked"
}

export interface BlockerRow {
  id: string
  date: string
  description: string | null
  amount: number
}

export interface UnpaidBlockersView {
  count: number
  firstDate: string | null
  lastDate: string | null
  sample: BlockerRow[]
}

const EMPTY_BLOCKERS: UnpaidBlockersView = { count: 0, firstDate: null, lastDate: null, sample: [] }

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function asDayKey(value: unknown): string | null {
  return isDayKey(value) ? value : null
}

/**
 * Corpo do 409 `UNPAID_BLOCKERS`. Nada aqui confia no formato: linha sem id de texto, sem dia
 * legível ou sem valor numérico é descartada, e um corpo estranho vira o painel vazio em vez de
 * derrubar a tela em cima de um fechamento que já falhou.
 */
export function readUnpaidBlockers(body: unknown): UnpaidBlockersView {
  const data = asRecord(body)
  if (Object.keys(data).length === 0) return EMPTY_BLOCKERS
  const rawSample = Array.isArray(data.sample) ? data.sample : []
  const sample: BlockerRow[] = []
  for (const entry of rawSample) {
    const row = asRecord(entry)
    const date = asDayKey(row.date)
    if (typeof row.id !== "string" || date === null || typeof row.amount !== "number") continue
    sample.push({
      id: row.id,
      date,
      description: typeof row.description === "string" ? row.description : null,
      amount: row.amount,
    })
  }
  return {
    count: typeof data.count === "number" && Number.isFinite(data.count) ? data.count : 0,
    firstDate: asDayKey(data.firstDate),
    lastDate: asDayKey(data.lastDate),
    sample,
  }
}

/**
 * Chave de dia → `Date` LOCAL à meia-noite, que é a moeda do seletor de período (`useDateRange`).
 * `new Date("2026-08-02")` seria meia-noite UTC, e a oeste de Greenwich cairia no dia anterior.
 */
export function localDateOfDayKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number)
  return new Date(year, month - 1, day)
}
