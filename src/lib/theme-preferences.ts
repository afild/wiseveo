import type { ImportedTheme } from "@/types/theme-customizer"
import { extraThemePresets } from "@/utils/extra-theme-presets"
import { colorSchemePresets } from "@/utils/color-scheme-presets"

export type ThemeMode = "light" | "dark" | "system"

export interface ThemePreferences {
  selectedTheme: string
  selectedExtraTheme: string
  selectedRadius: string
  importedTheme: ImportedTheme | null
  brandColorOverrides: Record<string, string>
  sidebarVariant: "sidebar" | "floating" | "inset"
  sidebarCollapsible: "offcanvas" | "icon" | "none"
  sidebarSide: "left" | "right"
  themeMode: ThemeMode
}

export const THEME_PREFERENCES_STORAGE_KEY = "wiseveo-theme-preferences"

export const defaultThemePreferences: ThemePreferences = {
  selectedTheme: "wiseveo",
  selectedExtraTheme: "",
  selectedRadius: "0.625rem",
  importedTheme: null,
  brandColorOverrides: {},
  sidebarVariant: "inset",
  sidebarCollapsible: "offcanvas",
  sidebarSide: "left",
  themeMode: "system",
}

export const defaultPreferences = defaultThemePreferences

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function normalizeThemeVariableName(variable: string) {
  return variable.replace(/^--/, "").trim()
}

function normalizeStringMap(value: unknown) {
  if (!isRecord(value)) return {}

  return Object.entries(value).reduce<Record<string, string>>((acc, [key, entry]) => {
    if (typeof entry !== "string") return acc

    const normalizedKey = normalizeThemeVariableName(key)
    const normalizedValue = entry.trim()

    if (!normalizedKey || !normalizedValue) {
      return acc
    }

    acc[normalizedKey] = normalizedValue
    return acc
  }, {})
}

function normalizeImportedTheme(value: unknown): ImportedTheme | null {
  if (!isRecord(value)) return null

  const light = normalizeStringMap(value.light)
  const dark = normalizeStringMap(value.dark)

  if (!Object.keys(light).length && !Object.keys(dark).length) {
    return null
  }

  return { light, dark }
}

export function normalizeThemePreferences(value: unknown): ThemePreferences {
  const input = isRecord(value) ? value : {}
  const legacyTheme = input.theme
  const legacyColorOverrides = isRecord(input.brandColorOverrides)
    ? input.brandColorOverrides
    : input.customColors

  const themeMode =
    input.themeMode === "light" || input.themeMode === "dark" || input.themeMode === "system"
      ? input.themeMode
      : legacyTheme === "light" || legacyTheme === "dark"
        ? legacyTheme
        : defaultThemePreferences.themeMode

  return {
    selectedTheme:
      typeof input.selectedTheme === "string" && input.selectedTheme.trim()
        ? input.selectedTheme
        : defaultThemePreferences.selectedTheme,
    // selectedTweakcnTheme é o nome legado do campo persistido (banco e
    // localStorage anteriores à renomeação) — a leitura precisa aceitá-lo sempre.
    selectedExtraTheme:
      typeof input.selectedExtraTheme === "string"
        ? input.selectedExtraTheme
        : typeof input.selectedTweakcnTheme === "string"
          ? input.selectedTweakcnTheme
          : defaultThemePreferences.selectedExtraTheme,
    selectedRadius:
      typeof input.selectedRadius === "string" && input.selectedRadius.trim()
        ? input.selectedRadius
        : defaultThemePreferences.selectedRadius,
    importedTheme: normalizeImportedTheme(input.importedTheme),
    brandColorOverrides: normalizeStringMap(legacyColorOverrides),
    sidebarVariant:
      input.sidebarVariant === "sidebar" ||
      input.sidebarVariant === "floating" ||
      input.sidebarVariant === "inset"
        ? input.sidebarVariant
        : defaultThemePreferences.sidebarVariant,
    sidebarCollapsible:
      input.sidebarCollapsible === "offcanvas" ||
      input.sidebarCollapsible === "icon" ||
      input.sidebarCollapsible === "none"
        ? input.sidebarCollapsible
        : defaultThemePreferences.sidebarCollapsible,
    sidebarSide:
      input.sidebarSide === "left" || input.sidebarSide === "right"
        ? input.sidebarSide
        : defaultThemePreferences.sidebarSide,
    themeMode,
  }
}

export function mergeThemePreferences(value?: unknown) {
  return normalizeThemePreferences(value)
}

function resolveBaseStyles(preferences: ThemePreferences) {
  if (preferences.importedTheme) {
    return {
      light: preferences.importedTheme.light ?? {},
      dark: preferences.importedTheme.dark ?? {},
    }
  }

  if (preferences.selectedExtraTheme) {
    const preset = extraThemePresets[preferences.selectedExtraTheme]
    if (preset) {
      return {
        light: preset.styles.light,
        dark: preset.styles.dark,
      }
    }
  }

  const preset =
    colorSchemePresets[preferences.selectedTheme || "wiseveo"]
    ?? colorSchemePresets.wiseveo

  return {
    light: preset.styles.light,
    dark: preset.styles.dark,
  }
}

export function getResolvedThemeMode(
  themeMode: ThemeMode,
  prefersDark: boolean,
): "light" | "dark" {
  if (themeMode === "system") {
    return prefersDark ? "dark" : "light"
  }

  return themeMode
}

export function getThemeStylesForMode(
  value: unknown,
  mode: "light" | "dark",
): Record<string, string> {
  const preferences = normalizeThemePreferences(value)
  const baseStyles = resolveBaseStyles(preferences)
  const modeStyles = mode === "dark" ? baseStyles.dark : baseStyles.light

  return {
    ...modeStyles,
    ...preferences.brandColorOverrides,
    radius: preferences.selectedRadius,
  }
}

export function getThemeStyleAttributes(
  value: unknown,
  mode: "light" | "dark",
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(getThemeStylesForMode(value, mode)).map(([key, entry]) => [
      `--${key}`,
      entry,
    ]),
  )
}

export function buildThemeBootstrapScript(
  value: unknown,
  themeStorageKey: string,
) {
  const preferences = normalizeThemePreferences(value)
  const payload = JSON.stringify({
    preferences,
    preferencesStorageKey: THEME_PREFERENCES_STORAGE_KEY,
    themeStorageKey,
    lightStyles: getThemeStylesForMode(preferences, "light"),
    darkStyles: getThemeStylesForMode(preferences, "dark"),
  }).replace(/</g, "\\u003c")

  return `(() => {
    const data = ${payload};
    const root = document.documentElement;
    const storedTheme = localStorage.getItem(data.themeStorageKey);
    const storedPreferences = localStorage.getItem(data.preferencesStorageKey);

    let preferences = data.preferences;
    if (storedPreferences) {
      try {
        const parsed = JSON.parse(storedPreferences);
        if (parsed && typeof parsed === "object") {
          preferences = { ...preferences, ...parsed };
        }
      } catch {}
    }

    let themeMode = preferences.themeMode;
    if (storedTheme === "light" || storedTheme === "dark" || storedTheme === "system") {
      themeMode = storedTheme;
    }

    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const mode = themeMode === "system"
      ? (prefersDark ? "dark" : "light")
      : themeMode;

    root.classList.remove("light", "dark");
    root.classList.add(mode);

    const styles = mode === "dark" ? data.darkStyles : data.lightStyles;
    Object.entries(styles).forEach(([key, entry]) => {
      if (!entry) return;
      root.style.setProperty("--" + key.replace(/^--/, ""), String(entry));
    });

    try {
      localStorage.setItem(data.themeStorageKey, themeMode);
      localStorage.setItem(data.preferencesStorageKey, JSON.stringify(preferences));
    } catch {}
  })();`
}
