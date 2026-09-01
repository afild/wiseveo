"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Layout, Palette, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ThemeTab } from "@/components/theme-customizer/theme-tab"
import { LayoutTab } from "@/components/theme-customizer/layout-tab"
import { ImportModal } from "@/components/theme-customizer/import-modal"
import { useThemePreferences, defaultPreferences } from "@/contexts/theme-preferences-context"
import { useThemeManager } from "@/hooks/use-theme-manager"
import { baseColors } from "@/config/theme-customizer-constants"
import { resolveAppearanceStyles } from "@/lib/appearance"
import { normalizeThemeVariableName, type ThemeMode } from "@/lib/theme-preferences"
import type { ImportedTheme } from "@/types/theme-customizer"

interface ThemeCustomizerPanelProps {
  description: string
}

export function ThemeCustomizerPanel({
  description,
}: ThemeCustomizerPanelProps) {
  const t = useTranslations("themeCustomizer")
  const { preferences, savePreferences } = useThemePreferences()
  const { isDarkMode, setTheme } = useThemeManager()

  const [activeTab, setActiveTab] = React.useState("theme")
  const [importModalOpen, setImportModalOpen] = React.useState(false)

  const resolvedStyles = React.useMemo(
    () => resolveAppearanceStyles(preferences),
    [preferences],
  )

  const currentBrandColorValues = React.useMemo(() => {
    const activeStyles = isDarkMode ? resolvedStyles.dark : resolvedStyles.light

    return Object.fromEntries(
      baseColors.map((color) => [
        color.cssVar,
        activeStyles[normalizeThemeVariableName(color.cssVar)] ?? "",
      ]),
    )
  }, [isDarkMode, resolvedStyles.dark, resolvedStyles.light])

  const handleThemeModeChange = React.useCallback((mode: ThemeMode) => {
    setTheme(mode)
    savePreferences({ themeMode: mode })
  }, [savePreferences, setTheme])

  const handleThemeSelect = React.useCallback((value: string) => {
    savePreferences({
      selectedTheme: value,
      selectedExtraTheme: "",
      importedTheme: null,
      brandColorOverrides: {},
    })
  }, [savePreferences])

  const handleExtraThemeSelect = React.useCallback((value: string) => {
    savePreferences({
      selectedTheme: "",
      selectedExtraTheme: value,
      importedTheme: null,
      brandColorOverrides: {},
    })
  }, [savePreferences])

  const handleRadiusChange = React.useCallback((value: string) => {
    savePreferences({ selectedRadius: value })
  }, [savePreferences])

  const handleColorOverrideChange = React.useCallback((cssVar: string, value: string) => {
    const normalizedKey = normalizeThemeVariableName(cssVar)
    const nextOverrides = { ...preferences.brandColorOverrides }
    const trimmedValue = value.trim()

    if (trimmedValue) {
      nextOverrides[normalizedKey] = trimmedValue
    } else {
      delete nextOverrides[normalizedKey]
    }

    savePreferences({
      brandColorOverrides: nextOverrides,
    })
  }, [preferences.brandColorOverrides, savePreferences])

  const handleImport = React.useCallback((themeData: ImportedTheme) => {
    savePreferences({
      importedTheme: themeData,
      selectedTheme: "",
      selectedExtraTheme: "",
      brandColorOverrides: {},
    })
  }, [savePreferences])

  const handleReset = React.useCallback(() => {
    setTheme(defaultPreferences.themeMode)
    savePreferences(defaultPreferences)
  }, [savePreferences, setTheme])

  return (
    <>
      <div className="space-y-4 rounded-xl border bg-card shadow-xs">
        <div className="flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("appearanceSource")}</p>
            <p className="text-sm text-muted-foreground">
              {description}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleReset} className="cursor-pointer">
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            {t("restoreDefault")}
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col">
          <div className="px-4">
            <TabsList className="grid h-12 w-full grid-cols-2 p-1.5">
              <TabsTrigger value="theme" className="cursor-pointer data-[state=active]:bg-background">
                <Palette className="mr-1 h-4 w-4" />
                {t("tabTheme")}
              </TabsTrigger>
              <TabsTrigger value="layout" className="cursor-pointer data-[state=active]:bg-background">
                <Layout className="mr-1 h-4 w-4" />
                {t("tabLayout")}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="theme" className="mt-0 flex-1">
            <ThemeTab
              currentBrandColorValues={currentBrandColorValues}
              onColorOverrideChange={handleColorOverrideChange}
              onImportClick={() => setImportModalOpen(true)}
              onSelectedRadiusChange={handleRadiusChange}
              onSelectedThemeChange={handleThemeSelect}
              onSelectedExtraThemeChange={handleExtraThemeSelect}
              onThemeModeChange={handleThemeModeChange}
              selectedRadius={preferences.selectedRadius}
              selectedTheme={preferences.selectedTheme}
              selectedExtraTheme={preferences.selectedExtraTheme}
              themeMode={preferences.themeMode}
            />
          </TabsContent>

          <TabsContent value="layout" className="mt-0 flex-1">
            <LayoutTab />
          </TabsContent>
        </Tabs>
      </div>

      <ImportModal
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
        onImport={handleImport}
      />
    </>
  )
}
