"use client"

import * as React from "react"
import { hasSharedDemoMarker } from "@/lib/demo-shared-client"
import {
  defaultThemePreferences,
  normalizeThemePreferences,
  THEME_PREFERENCES_STORAGE_KEY,
  type ThemePreferences,
} from "@/lib/theme-preferences"

export { type ThemePreferences, defaultThemePreferences as defaultPreferences }

interface ThemePreferencesContextValue {
  preferences: ThemePreferences
  loaded: boolean
  savePreferences: (partial: Partial<ThemePreferences>) => void
}

const ThemePreferencesContext = React.createContext<ThemePreferencesContextValue | null>(null)

interface ThemePreferencesProviderProps {
  children: React.ReactNode
  initialPreferences?: ThemePreferences | null
}

export function ThemePreferencesProvider({
  children,
  initialPreferences,
}: ThemePreferencesProviderProps) {
  const initialState = React.useMemo(
    () => normalizeThemePreferences(initialPreferences),
    [initialPreferences],
  )
  const [preferences, setPreferences] = React.useState<ThemePreferences>(initialState)
  const [loaded, setLoaded] = React.useState(Boolean(initialPreferences))
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestPrefsRef = React.useRef<ThemePreferences>(initialState)

  React.useEffect(() => {
    const next = normalizeThemePreferences(initialPreferences)
    setPreferences(next)
    latestPrefsRef.current = next

    if (initialPreferences) {
      setLoaded(true)
    }
  }, [initialPreferences])

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const cached = window.localStorage.getItem(THEME_PREFERENCES_STORAGE_KEY)

      if (cached) {
        try {
          const next = normalizeThemePreferences(JSON.parse(cached))
          setPreferences(next)
          latestPrefsRef.current = next
          setLoaded(true)
        } catch {
          // Ignore invalid local cache
        }
      }
    }

    if (initialPreferences) {
      setLoaded(true)
      return
    }

    let isMounted = true

    async function load() {
      try {
        const res = await fetch("/api/user/preferences")
        if (!res.ok) return

        const json = await res.json()

        if (json.success && isMounted) {
          const next = normalizeThemePreferences(json.data)
          setPreferences(next)
          latestPrefsRef.current = next
        }
      } catch {
        if (typeof window !== "undefined" && isMounted) {
          const cached = window.localStorage.getItem(THEME_PREFERENCES_STORAGE_KEY)

          if (cached) {
            try {
              const next = normalizeThemePreferences(JSON.parse(cached))
              setPreferences(next)
              latestPrefsRef.current = next
            } catch {
              // Ignore invalid local cache
            }
          }
        }
      } finally {
        if (isMounted) {
          setLoaded(true)
        }
      }
    }

    load()

    return () => {
      isMounted = false
    }
  }, [initialPreferences])

  const savePreferences = React.useCallback((partial: Partial<ThemePreferences>) => {
    setPreferences((prev) => {
      const next = normalizeThemePreferences({ ...prev, ...partial })
      latestPrefsRef.current = next

      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          THEME_PREFERENCES_STORAGE_KEY,
          JSON.stringify(next),
        )
      }

      return next
    })

    setLoaded(true)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      // Sessão compartilhada não pode escrever no servidor: o localStorage
      // sozinho já garante a escolha para esta visita.
      if (hasSharedDemoMarker()) return
      try {
        await fetch("/api/user/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(latestPrefsRef.current),
        })
      } catch {
        // Silently fail - keep UI responsive and retry on next change
      }
    }, 500)
  }, [])

  React.useEffect(() => {
    if (typeof window === "undefined" || !loaded) return

    window.localStorage.setItem(
      THEME_PREFERENCES_STORAGE_KEY,
      JSON.stringify(preferences),
    )
  }, [loaded, preferences])

  return (
    <ThemePreferencesContext.Provider value={{ preferences, loaded, savePreferences }}>
      {children}
    </ThemePreferencesContext.Provider>
  )
}

export function useThemePreferences() {
  const context = React.useContext(ThemePreferencesContext)
  if (!context) {
    throw new Error("useThemePreferences must be used within a ThemePreferencesProvider")
  }
  return context
}

export function useThemePreferencesSafe() {
  return React.useContext(ThemePreferencesContext)
}
