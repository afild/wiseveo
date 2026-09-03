"use client"

import * as React from "react"

import { installFetchInterceptor } from "@/lib/fetch-interceptors"
import {
  createDateClosingInterceptor,
  createGuardMachine,
  type DialogRequest,
  type DialogResult,
} from "../lib/guard-machine"
import { useDateClosing } from "./date-closing-provider"
import { PinDialog } from "./pin-dialog"

export interface DateClosingGuardValue {
  /** Abre a janela do PIN de propósito (parcelas). true = token obtido. */
  requestOverride: (days: string[]) => Promise<boolean>
  /** Abre a janela de criar PIN. true = criado. */
  requestPinCreation: () => Promise<boolean>
  /** Quem obteve token por fora (a janela de reabertura) entrega aqui. */
  adoptToken: (token: string, expiresAt: string) => void
  hasValidToken: () => boolean
  beginBatch: () => void
  endBatch: () => void
}

const FALLBACK: DateClosingGuardValue = {
  requestOverride: async () => false,
  requestPinCreation: async () => false,
  adoptToken: () => {},
  hasValidToken: () => false,
  beginBatch: () => {},
  endBatch: () => {},
}

const GuardContext = React.createContext<DateClosingGuardValue>(FALLBACK)

/**
 * Registra o handler de fetch do fechamento (ordem 20), monta a janela do PIN e entrega o
 * contexto para toda a subárvore do painel.
 *
 * O handler devolve uma promise que só resolve quando a pessoa responde a janela, então a
 * chamada original fica esperando — é isso que faz o laço de lote continuar de onde parou.
 * A janela é serializada: duas escritas paralelas que voltem 423 entram numa fila, e a
 * segunda aproveita o token da primeira em vez de perguntar de novo.
 */
export function DateClosingGuard({ children }: { children: React.ReactNode }) {
  const { state, refresh } = useDateClosing()
  const [machine] = React.useState(createGuardMachine)

  // `id` faz a janela remontar a cada pedido: estado inicial limpo, sem efeito de limpeza.
  const [pending, setPending] = React.useState<{ id: number; request: DialogRequest } | null>(null)
  const resolverRef = React.useRef<((result: DialogResult) => void) | null>(null)
  const queueRef = React.useRef<Promise<unknown>>(Promise.resolve())
  const tokenRef = React.useRef<{ token: string; expiresAt: string } | null>(null)
  const generationRef = React.useRef(0)
  const nextIdRef = React.useRef(0)

  const keepToken = React.useCallback(
    (token: string, expiresAt: string) => {
      machine.setToken(token, Date.parse(expiresAt))
      tokenRef.current = { token, expiresAt }
      generationRef.current += 1
    },
    [machine],
  )

  const settle = React.useCallback(
    (result: DialogResult) => {
      const resolve = resolverRef.current
      resolverRef.current = null
      setPending(null)
      if (result.kind === "token") keepToken(result.token, result.expiresAt)
      // O PIN pode ter nascido dentro da própria janela ("criar e prosseguir"): o provider
      // precisa saber, senão a próxima janela pediria para criar de novo.
      if (result.kind === "pinCreated" || (result.kind === "token" && result.pinCreated)) void refresh()
      resolve?.(result)
    },
    [keepToken, refresh],
  )

  const open = React.useCallback(
    (request: DialogRequest): Promise<DialogResult> => {
      const generation = generationRef.current
      const run = queueRef.current.then(() => {
        const held = tokenRef.current
        // Ganhou token enquanto esperava a vez na fila: não pergunta de novo.
        if (
          request.mode === "pin" &&
          held !== null &&
          generationRef.current !== generation &&
          machine.hasValidToken(Date.now())
        ) {
          return { kind: "token", token: held.token, expiresAt: held.expiresAt } satisfies DialogResult
        }
        return new Promise<DialogResult>((resolve) => {
          resolverRef.current = resolve
          nextIdRef.current += 1
          setPending({ id: nextIdRef.current, request })
        })
      })
      queueRef.current = run.then(
        () => undefined,
        () => undefined,
      )
      return run
    },
    [machine],
  )

  React.useEffect(
    () => installFetchInterceptor(createDateClosingInterceptor({ machine, open }), 20),
    [machine, open],
  )

  // Sair do painel com a janela aberta não pode deixar a escrita pendurada para sempre.
  React.useEffect(
    () => () => {
      resolverRef.current?.({ kind: "changeDate" })
      resolverRef.current = null
    },
    [],
  )

  const closedThrough = state?.closedThrough ?? null
  const canManageClosing = state?.canManageClosing ?? true

  const value = React.useMemo<DateClosingGuardValue>(
    () => ({
      requestOverride: async (days) => {
        const result = await open({
          days,
          periods: [],
          closedThrough,
          canOverride: canManageClosing,
          mode: "pin",
        })
        return result.kind === "token"
      },
      requestPinCreation: async () => {
        const result = await open({
          days: [],
          periods: [],
          closedThrough,
          canOverride: canManageClosing,
          mode: "createPin",
        })
        return result.kind === "pinCreated"
      },
      adoptToken: keepToken,
      hasValidToken: () => machine.hasValidToken(Date.now()),
      beginBatch: () => machine.beginBatch(),
      endBatch: () => machine.endBatch(),
    }),
    [canManageClosing, closedThrough, keepToken, machine, open],
  )

  return (
    <GuardContext.Provider value={value}>
      {children}
      {pending && (
        <PinDialog
          key={pending.id}
          request={pending.request}
          hasPin={state?.hasPin ?? true}
          canManagePin={state?.canManagePin ?? false}
          onResolve={settle}
        />
      )}
    </GuardContext.Provider>
  )
}

/** Fora do guard devolve um valor neutro (nada abre, nenhum token), nunca lança. */
export function useDateClosingGuard(): DateClosingGuardValue {
  return React.useContext(GuardContext)
}
