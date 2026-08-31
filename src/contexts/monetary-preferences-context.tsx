"use client"

import * as React from "react"
import { hasSharedDemoMarker } from "@/lib/demo-shared-client"
import {
  defaultMonetarySettings,
  resolveMonetarySettings,
  type MonetarySettings,
} from "@/lib/monetary"

const STORAGE_KEY = "wiseveo-monetary-preferences"

interface MonetaryPreferencesContextValue {
  preferences: MonetarySettings
  loaded: boolean
  savePreferences: (
    partial: Partial<MonetarySettings>,
  ) => Promise<{ success: boolean; data: MonetarySettings }>
}

const MonetaryPreferencesContext =
  React.createContext<MonetaryPreferencesContextValue | null>(null)

function readStoredMonetarySettings() {
  if (typeof window === "undefined") return null

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    return resolveMonetarySettings(JSON.parse(raw))
  } catch {
    return null
  }
}

function writeStoredMonetarySettings(settings: MonetarySettings) {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Ignore storage failures to avoid blocking the interface.
  }
}

export function MonetaryPreferencesProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [preferences, setPreferences] =
    React.useState<MonetarySettings>(defaultMonetarySettings)
  const [loaded, setLoaded] = React.useState(false)
  const latestPrefsRef = React.useRef<MonetarySettings>(defaultMonetarySettings)
  const lastLocalChangeAtRef = React.useRef(0)

  React.useEffect(() => {
    const stored = readStoredMonetarySettings()
    if (stored) {
      setPreferences(stored)
      latestPrefsRef.current = stored
      setLoaded(true)
    }

    let isActive = true
    const requestStartedAt = Date.now()

    async function load() {
      try {
        const res = await fetch("/api/user/monetary-preferences", {
          cache: "no-store",
        })
        if (!res.ok) return

        const json = await res.json()
        if (json.success) {
          const merged = resolveMonetarySettings(json.data)
          if (!isActive) return
          if (requestStartedAt < lastLocalChangeAtRef.current) return

          setPreferences(merged)
          latestPrefsRef.current = merged
          writeStoredMonetarySettings(merged)
        }
      } catch {
        // Silently fail and keep defaults or local cache.
      } finally {
        if (isActive) {
          setLoaded(true)
        }
      }
    }

    load()

    return () => {
      isActive = false
    }
  }, [])

  const savePreferences = React.useCallback(
    async (partial: Partial<MonetarySettings>) => {
      const previous = latestPrefsRef.current
      const next = resolveMonetarySettings({ ...previous, ...partial })

      lastLocalChangeAtRef.current = Date.now()
      setPreferences(next)
      latestPrefsRef.current = next
      writeStoredMonetarySettings(next)

      // Sessão compartilhada não pode escrever no servidor: o estado local
      // (já aplicado acima) e o localStorage bastam para esta visita.
      if (hasSharedDemoMarker()) {
        return { success: true, data: next }
      }

      try {
        const res = await fetch("/api/user/monetary-preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        })

        const json = await res.json().catch(() => null)

        if (!res.ok || !json?.success) {
          throw new Error("Failed to persist monetary preferences") // i18n-ignore: mensagem interna de Error, capturada silenciosamente (rollback de estado)
        }

        const persisted = resolveMonetarySettings(json.data ?? next)
        setPreferences(persisted)
        latestPrefsRef.current = persisted
        writeStoredMonetarySettings(persisted)

        return {
          success: true,
          data: persisted,
        }
      } catch {
        setPreferences(previous)
        latestPrefsRef.current = previous
        writeStoredMonetarySettings(previous)

        return {
          success: false,
          data: previous,
        }
      }
    },
    [],
  )

  return (
    <MonetaryPreferencesContext.Provider
      value={{ preferences, loaded, savePreferences }}
    >
      {children}
    </MonetaryPreferencesContext.Provider>
  )
}

export function useMonetaryPreferences() {
  const context = React.useContext(MonetaryPreferencesContext)

  if (!context) {
    throw new Error(
      "useMonetaryPreferences must be used within a MonetaryPreferencesProvider",
    )
  }

  return context
}

export function useMonetaryPreferencesSafe() {
  return React.useContext(MonetaryPreferencesContext)
}
