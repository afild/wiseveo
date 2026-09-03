"use client"

import * as React from "react"

import { DATE_CLOSING_ORDER, installFetchInterceptor } from "@/lib/fetch-interceptors"
import {
  createDateClosingInterceptor,
  createGuardMachine,
  createSerialDialogOpener,
  settledPending,
  type DialogRequest,
  type DialogResult,
} from "../lib/guard-machine"
import { useDateClosing } from "./date-closing-provider"
import { DateClosingLoadingDialog, PinDialog } from "./pin-dialog"

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

/** Só serve de `key`: garante remontagem mesmo se React juntar o fechar de uma janela com o abrir da seguinte. */
let dialogSeq = 0

interface PendingDialog {
  id: number
  request: DialogRequest
  resolve: (result: DialogResult) => void
}

/**
 * Registra o handler de fetch do fechamento (DATE_CLOSING_ORDER), monta a janela do PIN e entrega o
 * contexto para toda a subárvore do painel.
 *
 * O handler devolve uma promise que só resolve quando a pessoa responde a janela, então a
 * chamada original fica esperando — é isso que faz o laço de lote continuar de onde parou.
 * A fila e a decisão de cada pedido moram em `createSerialDialogOpener` (parte pura, testada sem
 * DOM); aqui ficam só o `show` (pôr a janela na tela) e o `dispose` do desmonte.
 */
export function DateClosingGuard({ children }: { children: React.ReactNode }) {
  const { state, refresh } = useDateClosing()
  const [machine] = React.useState(createGuardMachine)
  const [pending, setPending] = React.useState<PendingDialog | null>(null)

  const [opener] = React.useState(() =>
    createSerialDialogOpener({
      machine,
      show: (request) =>
        new Promise<DialogResult>((resolve) => {
          dialogSeq += 1
          setPending({ id: dialogSeq, request, resolve })
        }),
    }),
  )

  const settle = React.useCallback(
    (id: number, resolve: (result: DialogResult) => void, result: DialogResult) => {
      if (result.kind === "token") opener.keepToken(result.token, result.expiresAt)
      // O PIN pode ter nascido dentro da própria janela ("criar e prosseguir"): o provider
      // precisa saber, senão a próxima janela pediria para criar de novo.
      if (result.kind === "pinCreated" || (result.kind === "token" && result.pinCreated)) void refresh()
      // Devolve a resposta original JÁ: quem pediu (formulário, lote) não espera esta janela
      // sumir da tela para saber a decisão — é o painel de baixo que precisa continuar aberto.
      resolve(result)
      // Tira esta janela da árvore só no próximo ciclo do event loop, não já dentro deste
      // clique/Escape/X. Nesta versão do Radix, o pointerdown-outside da camada de baixo
      // (Sheet, Drawer, qualquer Dialog) é adiado para o "click" seguinte ao pointerdown — com
      // um `setTimeout(0)` de reforço embutido no próprio Radix. Se desmontarmos esta janela
      // DENTRO da mesma interação que a fechou, a camada de baixo vira "a mais alta" no meio do
      // processamento dessa MESMA interação e a lê como "fora dela", fechando-se sozinha: é
      // exatamente o defeito (mudar a data também derruba o painel). Um `setTimeout(0)` deixa o
      // Radix terminar de processar a interação atual — e o próprio atraso dele, do mesmo
      // tanto — antes de tirarmos esta camada do jogo. `settledPending` evita apagar um pedido
      // NOVO que a fila já tenha posto no lugar deste enquanto esperávamos.
      window.setTimeout(() => setPending((current) => settledPending(current, id)), 0)
    },
    [opener, refresh],
  )

  React.useEffect(
    () =>
      installFetchInterceptor(
        createDateClosingInterceptor({ machine, open: opener.open }),
        DATE_CLOSING_ORDER,
      ),
    [machine, opener],
  )

  // Sair do painel não pode deixar NENHUMA escrita pendurada: solta a janela que está na tela,
  // solta quem ainda esperava a vez na fila e recusa quem chegar depois. Sem isso, um pedido que
  // ainda estava na fila criava janela numa árvore desmontada e o fetch dele esperava para sempre.
  React.useEffect(() => opener.mount(), [opener])

  // Estado ainda não chegou e há janela para mostrar: pede de novo em vez de chutar permissão.
  React.useEffect(() => {
    if (pending && state === null) void refresh()
  }, [pending, refresh, state])

  const closedThrough = state?.closedThrough ?? null

  const value = React.useMemo<DateClosingGuardValue>(
    () => ({
      requestOverride: async (days) => {
        const result = await opener.open({
          days,
          periods: [],
          closedThrough,
          // Sem 423 não há palavra do servidor sobre permissão: quem decide é o estado vivo,
          // lido pela janela na hora de desenhar.
          canOverride: true,
          mode: "pin",
        })
        return result.kind === "token"
      },
      requestPinCreation: async () => {
        const result = await opener.open({
          days: [],
          periods: [],
          closedThrough,
          canOverride: true,
          mode: "createPin",
        })
        return result.kind === "pinCreated"
      },
      adoptToken: opener.keepToken,
      hasValidToken: () => machine.hasValidToken(Date.now()),
      beginBatch: () => machine.beginBatch(),
      endBatch: () => machine.endBatch(),
    }),
    [closedThrough, machine, opener],
  )

  return (
    <GuardContext.Provider value={value}>
      {children}
      {pending &&
        (state === null ? (
          // Sem estado não dá para desenhar a janela: um campo de PIN para quem não pode liberar
          // seria um controle que só falha. Espera o estado; fechar continua resolvendo a promise.
          <DateClosingLoadingDialog
            key={pending.id}
            mode={pending.request.mode}
            onCancel={() => settle(pending.id, pending.resolve, { kind: "changeDate" })}
          />
        ) : (
          <PinDialog
            key={pending.id}
            request={pending.request}
            closedThrough={state.closedThrough}
            hasPin={state.hasPin}
            canManagePin={state.canManagePin}
            canManageClosing={state.canManageClosing}
            onResolve={(result) => settle(pending.id, pending.resolve, result)}
          />
        ))}
    </GuardContext.Provider>
  )
}

/** Fora do guard devolve um valor neutro (nada abre, nenhum token), nunca lança. */
export function useDateClosingGuard(): DateClosingGuardValue {
  return React.useContext(GuardContext)
}
