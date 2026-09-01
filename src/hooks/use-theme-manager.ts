"use client"

import React from "react"
import { baseColors } from "@/config/theme-customizer-constants"
import { colorThemes } from "@/config/theme-data"
import { useTheme } from "@/hooks/use-theme"
import type { ImportedTheme, ThemePreset } from "@/types/theme-customizer"

export function useThemeManager() {
  const { theme, setTheme } = useTheme()
  const [brandColorsValues, setBrandColorsValues] = React.useState<Record<string, string>>({})
  const [systemPrefersDark, setSystemPrefersDark] = React.useState(false)

  React.useEffect(() => {
    if (typeof window === "undefined") return

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const updatePreference = () => setSystemPrefersDark(mediaQuery.matches)

    updatePreference()
    mediaQuery.addEventListener("change", updatePreference)

    return () => mediaQuery.removeEventListener("change", updatePreference)
  }, [])

  const isDarkMode = React.useMemo(() => {
    if (theme === "dark") return true
    if (theme === "light") return false
    return systemPrefersDark
  }, [systemPrefersDark, theme])

  const resetTheme = React.useCallback(() => {
    const root = document.documentElement
    const allPossibleVars = [
      "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
      "primary", "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground",
      "accent", "accent-foreground", "destructive", "destructive-foreground", "border", "input",
      "ring", "radius",
      "chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "chart-6",
      "sidebar", "sidebar-background", "sidebar-foreground", "sidebar-primary", "sidebar-primary-foreground",
      "sidebar-accent", "sidebar-accent-foreground", "sidebar-border", "sidebar-ring",
      "font-sans", "font-serif", "font-mono",
      "shadow-2xs", "shadow-xs", "shadow-sm", "shadow", "shadow-md", "shadow-lg", "shadow-xl", "shadow-2xl",
      "spacing", "tracking-normal",
      "card-header", "card-content", "card-footer", "muted-background", "accent-background",
      "destructive-background", "positive", "warning", "warning-foreground", "success", "success-foreground",
      "info", "info-foreground",
    ]

    allPossibleVars.forEach((varName) => {
      root.style.removeProperty(`--${varName}`)
    })

    const inlineStyles = root.style
    for (let i = inlineStyles.length - 1; i >= 0; i--) {
      const property = inlineStyles[i]
      if (property.startsWith("--")) {
        root.style.removeProperty(property)
      }
    }

    setBrandColorsValues({})
  }, [])

  const updateBrandColorsFromTheme = React.useCallback((styles: Record<string, string>) => {
    const nextValues: Record<string, string> = {}

    baseColors.forEach((color) => {
      const varName = color.cssVar.replace("--", "")
      if (styles[varName]) {
        nextValues[color.cssVar] = styles[varName]
      }
    })

    setBrandColorsValues(nextValues)
  }, [])

  const applyStyleMap = React.useCallback((styles: Record<string, string>) => {
    resetTheme()
    const root = document.documentElement

    Object.entries(styles).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value)
    })

    updateBrandColorsFromTheme(styles)
  }, [resetTheme, updateBrandColorsFromTheme])

  const applyTheme = React.useCallback((themeValue: string, darkMode: boolean) => {
    const selectedTheme = colorThemes.find((item) => item.value === themeValue)
    if (!selectedTheme) return

    applyStyleMap(darkMode ? selectedTheme.preset.styles.dark : selectedTheme.preset.styles.light)
  }, [applyStyleMap])

  const applyExtraTheme = React.useCallback((themePreset: ThemePreset, darkMode: boolean) => {
    applyStyleMap(darkMode ? themePreset.styles.dark : themePreset.styles.light)
  }, [applyStyleMap])

  const applyImportedTheme = React.useCallback((themeData: ImportedTheme, darkMode: boolean) => {
    applyStyleMap(darkMode ? themeData.dark : themeData.light)
  }, [applyStyleMap])

  const applyBrandColorOverrides = React.useCallback((overrides: Record<string, string>) => {
    const nextValues: Record<string, string> = {}

    Object.entries(overrides).forEach(([key, value]) => {
      document.documentElement.style.setProperty(`--${key}`, value)
      nextValues[`--${key}`] = value
    })

    if (Object.keys(nextValues).length) {
      setBrandColorsValues((prev) => ({ ...prev, ...nextValues }))
    }
  }, [])

  const applyRadius = React.useCallback((radius: string) => {
    document.documentElement.style.setProperty("--radius", radius)
  }, [])

  const handleColorChange = React.useCallback((cssVar: string, value: string) => {
    document.documentElement.style.setProperty(cssVar, value)
    setBrandColorsValues((prev) => ({ ...prev, [cssVar]: value }))
  }, [])

  return {
    theme,
    setTheme,
    isDarkMode,
    brandColorsValues,
    setBrandColorsValues,
    resetTheme,
    updateBrandColorsFromTheme,
    applyStyleMap,
    applyTheme,
    applyExtraTheme,
    applyImportedTheme,
    applyBrandColorOverrides,
    applyRadius,
    handleColorChange,
  }
}
