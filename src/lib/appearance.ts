import { tweakcnPresets } from "@/utils/tweakcn-theme-presets"
import { shadcnThemePresets } from "@/utils/shadcn-ui-theme-presets"
import {
  normalizeThemePreferences,
  type ThemePreferences,
} from "@/lib/theme-preferences"

type ThemeStyleMap = Record<string, string>

export interface ResolvedAppearanceStyles {
  light: ThemeStyleMap
  dark: ThemeStyleMap
}

export function resolveAppearanceStyles(
  value?: Partial<ThemePreferences> | null,
): ResolvedAppearanceStyles {
  const preferences = normalizeThemePreferences(value)

  const baseStyles = resolveBaseStyles(preferences)
  const colorOverrides = preferences.brandColorOverrides
  const sharedStyles = {
    radius: preferences.selectedRadius,
    ...colorOverrides,
  }

  return {
    light: { ...baseStyles.light, ...sharedStyles },
    dark: { ...baseStyles.dark, ...sharedStyles },
  }
}

function resolveBaseStyles(
  preferences: ThemePreferences,
): ResolvedAppearanceStyles {
  if (preferences.importedTheme) {
    return {
      light: preferences.importedTheme.light ?? {},
      dark: preferences.importedTheme.dark ?? {},
    }
  }

  if (preferences.selectedTweakcnTheme) {
    const preset = tweakcnPresets[preferences.selectedTweakcnTheme]
    if (preset) {
      return {
        light: preset.styles.light,
        dark: preset.styles.dark,
      }
    }
  }

  const preset = shadcnThemePresets[preferences.selectedTheme || "wiseveo"]
    ?? shadcnThemePresets.wiseveo

  return {
    light: preset.styles.light,
    dark: preset.styles.dark,
  }
}
