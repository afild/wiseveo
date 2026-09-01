import { colorSchemePresets } from '@/utils/color-scheme-presets'
import { extraThemePresets } from '@/utils/extra-theme-presets'
import type { ColorTheme } from '@/types/theme-customizer'

// Temas extras para o dropdown - convertidos de extraThemePresets
export const extraThemes: ColorTheme[] = Object.entries(extraThemePresets).map(([key, preset]) => ({
  name: preset.label || key,
  value: key,
  preset: preset
}))

// Esquemas de cores para o dropdown - convertidos de colorSchemePresets
export const colorThemes: ColorTheme[] = Object.entries(colorSchemePresets).map(([key, preset]) => ({
  name: preset.label || key,
  value: key,
  preset: preset
}))
