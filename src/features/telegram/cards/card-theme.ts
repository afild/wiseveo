/**
 * Só a largura é fixa. A altura vem da medição do conteúdo (ver
 * card-renderer.service.ts) — antes era chutada e o excesso era cortado sem
 * aviso. `minHeight` é só para o card curto não virar uma tarja.
 */
export const CARD_SIZE = {
  width: 800,
  minHeight: 420,
}

/** Nome da família registrada no satori. i18n-ignore: identificador, não é UI. */
export const CARD_FAMILY = "Figtree"

export type CardThemeMode = "dark" | "light"

export interface CardTheme {
  gradientStart: string
  gradientEnd: string
  /** Painel sólido — usado pelos cards de molde antigo. */
  panel: string
  panelSoft: string
  foreground: string
  muted: string
  border: string
  positive: string
  negative: string
  warning: string
  accent: string
  /** Tom claro do símbolo da marca (a estrela). Brand Book, cap. 04. */
  accentSoft: string
  /** Opacidade do brilho decorativo, em hexadecimal de dois dígitos. */
  glow: string
}

/**
 * Os dois temas do card.
 *
 * O escuro é o de sempre. O claro NÃO é o escuro invertido: no fundo claro o
 * verde e o vermelho do modo escuro somem (foram escolhidos para brilhar no
 * escuro), então os tons de estado são os fechados, que têm contraste sobre
 * branco. O cian da marca também fecha para o teal — é a variante clara oficial
 * do símbolo, a mesma que a aplicação usa no tema claro.
 */
export const CARD_THEMES: Record<CardThemeMode, CardTheme> = {
  dark: {
    gradientStart: "#111827",
    gradientEnd: "#0B1220",
    panel: "rgba(26, 36, 54, 0.7)",
    panelSoft: "rgba(18, 54, 66, 0.5)",
    foreground: "#E6EBF2",
    muted: "#8B99AE",
    border: "#273244",
    positive: "#4ADE80",
    negative: "#FCA5A5",
    warning: "#FBBF24",
    accent: "#22D3EE",
    accentSoft: "#67E8F9",
    glow: "2E",
  },
  light: {
    gradientStart: "#FFFFFF",
    gradientEnd: "#EEF2F7",
    panel: "rgba(15, 23, 42, 0.05)",
    panelSoft: "rgba(15, 118, 110, 0.07)",
    foreground: "#0F172A",
    muted: "#5A6B85",
    border: "#D5DEEA",
    positive: "#15803D",
    negative: "#B91C1C",
    warning: "#B45309",
    accent: "#0F766E",
    accentSoft: "#134E4A",
    glow: "1F",
  },
}

export const DEFAULT_CARD_THEME_MODE: CardThemeMode = "dark"

export function resolveCardThemeMode(value: unknown): CardThemeMode {
  return value === "light" || value === "dark" ? value : DEFAULT_CARD_THEME_MODE
}

export function getCardTheme(mode: CardThemeMode = DEFAULT_CARD_THEME_MODE): CardTheme {
  return CARD_THEMES[mode]
}

/** O tema escuro como constante — é o que os cards de molde antigo usam. */
export const cardTheme = CARD_THEMES.dark

export function toneColor(
  tone?: "default" | "positive" | "negative" | "warning" | null,
  theme: CardTheme = cardTheme,
) {
  if (tone === "positive") return theme.positive
  if (tone === "negative") return theme.negative
  if (tone === "warning") return theme.warning
  return theme.foreground
}
