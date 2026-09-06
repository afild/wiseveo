import { effectiveAmber, type RadarPreferences } from "./radar-preferences"

export const RADAR_NEUTRAL = "var(--sidebar-accent-foreground)"
export const RADAR_RED = "var(--destructive)"
export const RADAR_AMBER = "var(--warning)"
export const RADAR_GREEN = "var(--positive)"

/**
 * `oklab` e não sRGB: misturar verde e vermelho em sRGB atravessa um verde-oliva sujo, e o
 * ponto tem 12px, então o meio da rampa é justamente onde a leitura precisa ser limpa.
 * A mistura é sobre os TOKENS, então claro e escuro acompanham sem código extra.
 */
function mix(target: string, base: string, ratio: number): string {
  // Denominador zero ou não finito chega aqui como NaN ou ±Infinity. Isso não é hipótese: a
  // validação garante `red < amber < green` nos números GRAVADOS, mas a média calculada pode
  // colapsar por arredondamento de ponto flutuante. Com `green = 1.0000000000000002` e
  // `red = 1`, a média dá exatamente 1, e `amber - red` vira zero. São valores que ninguém
  // digita, mas que entram por um PUT cru na rota. Sem esta guarda, o `color-mix` sairia com
  // "NaN%" e o ponto ficaria sem cor nenhuma.
  if (!Number.isFinite(ratio)) return target
  const percent = Math.round(Math.min(1, Math.max(0, ratio)) * 100)
  if (percent === 100) return target
  if (percent === 0) return base
  return `color-mix(in oklab, ${target} ${percent}%, ${base})`
}

/**
 * Cor do ponto para um saldo. Trava nas pontas: abaixo do piso não escurece mais, acima do
 * teto não clareia mais. Saldo negativo sai vermelho puro por declaração de intenção. Na
 * prática a validação já recusa piso negativo, então um saldo abaixo de zero cairia no
 * vermelho de qualquer jeito pela trava do piso; a guarda explícita existe para o dia em
 * que o piso puder ser negativo.
 */
export function radarColorFor(
  balance: number | null,
  preferences: RadarPreferences,
): string {
  if (balance === null || !Number.isFinite(balance)) return RADAR_NEUTRAL
  if (balance < 0) return RADAR_RED

  const amber = effectiveAmber(preferences)
  if (balance <= preferences.red) return RADAR_RED
  if (balance >= preferences.green) return RADAR_GREEN

  if (balance <= amber) {
    return mix(RADAR_AMBER, RADAR_RED, (balance - preferences.red) / (amber - preferences.red))
  }

  return mix(RADAR_GREEN, RADAR_AMBER, (balance - amber) / (preferences.green - amber))
}
