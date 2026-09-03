"use client"

import * as React from "react"

export interface DateClosingState {
  closedThrough: string | null
  hasPin: boolean
  canManageClosing: boolean
  canManagePin: boolean
  showcase: boolean
}

interface DateClosingContextValue {
  state: DateClosingState | null
  refresh: () => Promise<void>
}

const noop = async () => {}
const FALLBACK: DateClosingContextValue = { state: null, refresh: noop }

const DateClosingContext = React.createContext<DateClosingContextValue>(FALLBACK)

/** Leitura da rota. Falha em silêncio (401 na vitrine, rede caída) devolvendo null. */
async function readDateClosingState(): Promise<DateClosingState | null> {
  try {
    const response = await fetch("/api/security/date-closing", { cache: "no-store" })
    if (!response.ok) return null
    return resolveState(await response.json())
  } catch {
    // Sem estado é melhor que estado errado: a tela fica no modo neutro.
    return null
  }
}

function resolveState(payload: unknown): DateClosingState {
  const data = (typeof payload === "object" && payload !== null ? payload : {}) as Record<string, unknown>
  return {
    closedThrough: typeof data.closedThrough === "string" ? data.closedThrough : null,
    hasPin: data.hasPin === true,
    canManageClosing: data.canManageClosing === true,
    canManagePin: data.canManagePin === true,
    showcase: data.showcase === true,
  }
}

/**
 * Estado do fechamento para a sessão atual, lido uma vez ao montar o painel e recarregado
 * sempre que alguém fecha, reabre ou cria o PIN.
 *
 * Nasce em `null` de propósito: o layout do painel é client component, então não existe
 * estado no primeiro pintar. Enquanto for `null` o switch fica desabilitado, sem cadeado e
 * sem dica — nunca um estado chutado, que piscaria "aberto" num banco fechado.
 *
 * A leitura falha em silêncio (401 na vitrine, rede caída): o estado só continua `null`,
 * e a trava de verdade é a do servidor, que responde 423.
 */
export function DateClosingProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<DateClosingState | null>(null)

  const refresh = React.useCallback(async () => {
    const next = await readDateClosingState()
    if (next) setState(next)
  }, [])

  React.useEffect(() => {
    let active = true
    void (async () => {
      const next = await readDateClosingState()
      if (active && next) setState(next)
    })()
    return () => {
      active = false
    }
  }, [])

  const value = React.useMemo(() => ({ state, refresh }), [state, refresh])

  return <DateClosingContext.Provider value={value}>{children}</DateClosingContext.Provider>
}

/** Fora do provider devolve o valor neutro (estado `null`), nunca lança. */
export function useDateClosing(): DateClosingContextValue {
  return React.useContext(DateClosingContext)
}
