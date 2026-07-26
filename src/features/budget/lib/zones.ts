export type ZoneKey = "safe" | "warning" | "danger"

export const ZONE_THRESHOLDS = { safe: 50, warning: 80 } as const

/** Única fonte de verdade dos cortes de zona (antes triplicado nos componentes). */
export function getZoneKey(pct: number): ZoneKey {
  if (pct <= ZONE_THRESHOLDS.safe) return "safe"
  if (pct <= ZONE_THRESHOLDS.warning) return "warning"
  return "danger"
}
