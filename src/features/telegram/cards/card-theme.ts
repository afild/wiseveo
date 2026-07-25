export const CARD_SIZE = {
  width: 800,
  height: 420,
}

export const cardTheme = {
  background: "#0B1220",
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
}

export function toneColor(tone?: "default" | "positive" | "negative" | "warning") {
  if (tone === "positive") return cardTheme.positive
  if (tone === "negative") return cardTheme.negative
  if (tone === "warning") return cardTheme.warning
  return cardTheme.foreground
}
