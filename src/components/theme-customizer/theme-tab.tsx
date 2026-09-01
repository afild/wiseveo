"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Check, Dices, Moon, Palette, Sun, Upload, MonitorCog } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { colorThemes, extraThemes } from "@/config/theme-data"
import { radiusOptions, baseColors } from "@/config/theme-customizer-constants"
import { ColorPicker } from "@/components/color-picker"
import { Logo } from "@/components/logo"
import type { ThemeMode } from "@/lib/theme-preferences"

interface ThemeTabProps {
  currentBrandColorValues: Record<string, string>
  onColorOverrideChange: (cssVar: string, value: string) => void
  onImportClick: () => void
  onSelectedRadiusChange: (radius: string) => void
  onSelectedThemeChange: (theme: string) => void
  onSelectedExtraThemeChange: (theme: string) => void
  onThemeModeChange: (mode: ThemeMode) => void
  selectedRadius: string
  selectedTheme: string
  selectedExtraTheme: string
  themeMode: ThemeMode
}

export function ThemeTab({
  currentBrandColorValues,
  onColorOverrideChange,
  onImportClick,
  onSelectedRadiusChange,
  onSelectedThemeChange,
  onSelectedExtraThemeChange,
  onThemeModeChange,
  selectedRadius,
  selectedTheme,
  selectedExtraTheme,
  themeMode,
}: ThemeTabProps) {
  const t = useTranslations("themeCustomizer")

  // O tema oficial sai da lista de secundários: ele tem o card de destaque próprio.
  const secondaryColorThemes = React.useMemo(
    () => colorThemes.filter((theme) => theme.value !== "wiseveo"),
    [],
  )
  const isWiseveoActive = selectedTheme === "wiseveo" && !selectedExtraTheme

  const handleRandomColorScheme = React.useCallback(() => {
    const randomTheme = secondaryColorThemes[Math.floor(Math.random() * secondaryColorThemes.length)]
    onSelectedThemeChange(randomTheme.value)
  }, [onSelectedThemeChange, secondaryColorThemes])

  const handleRandomExtraTheme = React.useCallback(() => {
    const randomTheme = extraThemes[Math.floor(Math.random() * extraThemes.length)]
    onSelectedExtraThemeChange(randomTheme.value)
  }, [onSelectedExtraThemeChange])

  return (
    <div className="space-y-6 p-4">
      <div className="space-y-3">
        <Label className="text-sm font-medium">{t("mode")}</Label>
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant={themeMode === "light" ? "secondary" : "outline"}
            size="sm"
            onClick={() => onThemeModeChange("light")}
            className="cursor-pointer"
          >
            <Sun className="mr-1 h-4 w-4" />
            {t("light")}
          </Button>
          <Button
            variant={themeMode === "dark" ? "secondary" : "outline"}
            size="sm"
            onClick={() => onThemeModeChange("dark")}
            className="cursor-pointer"
          >
            <Moon className="mr-1 h-4 w-4" />
            {t("dark")}
          </Button>
          <Button
            variant={themeMode === "system" ? "secondary" : "outline"}
            size="sm"
            onClick={() => onThemeModeChange("system")}
            className="cursor-pointer"
          >
            <MonitorCog className="mr-1 h-4 w-4" />
            {t("system")}
          </Button>
        </div>
      </div>

      <Separator />

      <div className="space-y-3">
        <Label className="text-sm font-medium">{t("officialTheme")}</Label>
        <button
          type="button"
          onClick={() => onSelectedThemeChange("wiseveo")}
          aria-pressed={isWiseveoActive}
          className={`flex w-full cursor-pointer items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
            isWiseveoActive
              ? "border-primary bg-accent/40"
              : "border-border hover:border-primary/50"
          }`}
        >
          <Logo size={28} />
          <span className="flex-1">
            {/* i18n-ignore: wordmark da marca, palavra única e não traduzível */}
            <span className="block text-sm font-semibold tracking-tight">WISEVEO</span>
            <span className="block text-xs text-muted-foreground">{t("officialThemeDesc")}</span>
          </span>
          {isWiseveoActive && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
        </button>
      </div>

      <Separator />

      <div className="space-y-1">
        <Label className="text-sm font-medium">{t("secondaryThemes")}</Label>
        <p className="text-xs text-muted-foreground">{t("secondaryThemesDesc")}</p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">{t("colorSchemes")}</Label>
          <Button variant="outline" size="sm" onClick={handleRandomColorScheme} className="cursor-pointer">
            <Dices className="mr-1.5 h-3.5 w-3.5" />
            {t("random")}
          </Button>
        </div>

        <Select value={selectedTheme || undefined} onValueChange={onSelectedThemeChange}>
          <SelectTrigger className="w-full cursor-pointer">
            <SelectValue placeholder={t("chooseColorScheme")} />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            <div className="p-2">
              {secondaryColorThemes.map((theme) => (
                <SelectItem key={theme.value} value={theme.value} className="cursor-pointer">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <div className="h-3 w-3 rounded-full border border-border/20" style={{ backgroundColor: theme.preset.styles.light.primary }} />
                      <div className="h-3 w-3 rounded-full border border-border/20" style={{ backgroundColor: theme.preset.styles.light.secondary }} />
                      <div className="h-3 w-3 rounded-full border border-border/20" style={{ backgroundColor: theme.preset.styles.light.accent }} />
                      <div className="h-3 w-3 rounded-full border border-border/20" style={{ backgroundColor: theme.preset.styles.light.muted }} />
                    </div>
                    <span>{theme.name}</span>
                  </div>
                </SelectItem>
              ))}
            </div>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">{t("extraThemes")}</Label>
          <Button variant="outline" size="sm" onClick={handleRandomExtraTheme} className="cursor-pointer">
            <Dices className="mr-1.5 h-3.5 w-3.5" />
            {t("random")}
          </Button>
        </div>

        <Select value={selectedExtraTheme || undefined} onValueChange={onSelectedExtraThemeChange}>
          <SelectTrigger className="w-full cursor-pointer">
            <SelectValue placeholder={t("chooseExtraTheme")} />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            <div className="p-2">
              {extraThemes.map((theme) => (
                <SelectItem key={theme.value} value={theme.value} className="cursor-pointer">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <div className="h-3 w-3 rounded-full border border-border/20" style={{ backgroundColor: theme.preset.styles.light.primary }} />
                      <div className="h-3 w-3 rounded-full border border-border/20" style={{ backgroundColor: theme.preset.styles.light.secondary }} />
                      <div className="h-3 w-3 rounded-full border border-border/20" style={{ backgroundColor: theme.preset.styles.light.accent }} />
                      <div className="h-3 w-3 rounded-full border border-border/20" style={{ backgroundColor: theme.preset.styles.light.muted }} />
                    </div>
                    <span>{theme.name}</span>
                  </div>
                </SelectItem>
              ))}
            </div>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      <div className="space-y-3">
        <Label className="text-sm font-medium">{t("radius")}</Label>
        <div className="grid grid-cols-6 gap-2">
          {radiusOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`relative flex min-w-0 items-center justify-center rounded-md border px-1 py-3 transition-colors ${
                selectedRadius === option.value
                  ? "border-primary"
                  : "border-border hover:border-border/60"
              }`}
              onClick={() => onSelectedRadiusChange(option.value)}
            >
              <span className="text-xs font-medium tabular-nums">{option.name}</span>
            </button>
          ))}
        </div>
      </div>

      <Separator />

      <div className="space-y-3">
        <Button
          variant="outline"
          size="lg"
          onClick={onImportClick}
          className="w-full cursor-pointer"
        >
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          {t("importTheme")}
        </Button>
      </div>

      <Accordion type="single" collapsible className="w-full rounded-lg border-b">
        <AccordionItem value="brand-colors" className="overflow-hidden rounded-lg border border-border">
          <AccordionTrigger className="px-4 py-3 transition-colors hover:bg-muted/50 hover:no-underline">
            <Label className="cursor-pointer text-sm font-medium">{t("brandColors")}</Label>
          </AccordionTrigger>
          <AccordionContent className="space-y-3 border-t border-border bg-muted/20 px-4 pb-4 pt-2">
            {baseColors.map((color) => (
              <ColorPicker
                key={color.cssVar}
                label={t(`brandColor.${color.name}` as never)}
                cssVar={color.cssVar}
                value={currentBrandColorValues[color.cssVar] || ""}
                onChange={onColorOverrideChange}
              />
            ))}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="space-y-3 rounded-lg bg-muted p-4">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">{t("customizationGuide")}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("customizationGuideDesc")}
        </p>
      </div>
    </div>
  )
}
