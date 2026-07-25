import type { 
  SidebarVariant, 
  SidebarCollapsibleOption, 
  SidebarSideOption, 
  RadiusOption, 
  BrandColor 
} from '@/types/theme-customizer'

// Radius options
export const radiusOptions: RadiusOption[] = [
  { name: "0", value: "0rem" },
  { name: "0.3", value: "0.3rem" },
  { name: "0.5", value: "0.5rem" },
  { name: "0.625", value: "0.625rem" },
  { name: "0.75", value: "0.75rem" },
  { name: "1.0", value: "1rem" },
]

// Sidebar variant options
// NOTE: `name`/`description` hold stable i18n key suffixes (not display text).
// Consuming components resolve the actual label via t(`themeCustomizer.sidebarVariant.${value}`)
// — see layout-tab.tsx. `value` is the real, non-translatable identifier used by the app.
export const sidebarVariants: SidebarVariant[] = [
  { name: "sidebar", value: "sidebar", description: "sidebar" },
  { name: "floating", value: "floating", description: "floating" },
  { name: "inset", value: "inset", description: "inset" },
]

// Sidebar collapsible options — `name`/`description` are i18n key suffixes, see layout-tab.tsx.
export const sidebarCollapsibleOptions: SidebarCollapsibleOption[] = [
  { name: "offcanvas", value: "offcanvas", description: "offcanvas" },
  { name: "icon", value: "icon", description: "icon" },
  { name: "none", value: "none", description: "none" },
]

// Sidebar side options — `name` is an i18n key suffix, see layout-tab.tsx.
export const sidebarSideOptions: SidebarSideOption[] = [
  { name: "left", value: "left" },
  { name: "right", value: "right" },
]

// Define brand colors for custom color inputs.
// `name` is an i18n key suffix resolved via t(`themeCustomizer.brandColor.${name}`) in theme-tab.tsx.
export const baseColors: BrandColor[] = [
  { name: "primary", cssVar: "--primary" },
  { name: "primaryForeground", cssVar: "--primary-foreground" },
  { name: "secondary", cssVar: "--secondary" },
  { name: "secondaryForeground", cssVar: "--secondary-foreground" },
  { name: "accent", cssVar: "--accent" },
  { name: "accentForeground", cssVar: "--accent-foreground" },
  { name: "muted", cssVar: "--muted" },
  { name: "mutedForeground", cssVar: "--muted-foreground" },
]
