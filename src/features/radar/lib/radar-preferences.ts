/**
 * `users.preferences_json.radar`. Chave de PRIMEIRO NÍVEL, no mesmo lugar de `backup`,
 * `dateClosing` e `budgetFormula`. Nunca dentro de `monetary`: `resolveMonetarySettings`
 * remonta um literal de três chaves e apagaria qualquer campo extra na próxima vez que a
 * moeda fosse salva.
 *
 * Os limiares são valores absolutos, na moeda escolhida em Configurações → Moeda. Não há
 * conversão nenhuma no app (nenhum modelo tem coluna de moeda), então trocar de moeda não
 * invalida o número: ele continua comparando exatamente os mesmos saldos.
 */
export type RadarMode = "lookahead" | "today"

export interface RadarPreferences {
  /** `lookahead`: cor pelo menor saldo à frente. `today`: cor pelo saldo de hoje. */
  mode: RadarMode
  /** Teto de dias que o radar olha à frente, 1 a 365. O horizonte de dados pode encurtar. */
  horizonDays: number
  /** A partir daqui a cor é verde puro. */
  green: number
  /** Pivô âmbar. `null` = acompanhar a média entre verde e vermelho. */
  amber: number | null
  /** Daqui para baixo a cor é vermelho puro. */
  red: number
}

export const MIN_HORIZON_DAYS = 1
export const MAX_HORIZON_DAYS = 365

/**
 * Os mesmos números dos degraus fixos que o radar usava antes de ser configurável
 * (`< 100` vermelho, `< 300` âmbar, resto verde). Quem nunca abrir Configurações mantém
 * os mesmos pontos de virada; só a transição entre eles passa a ser suave.
 */
export const defaultRadarPreferences: RadarPreferences = {
  mode: "lookahead",
  horizonDays: 30,
  green: 300,
  amber: null,
  red: 100,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

/** O par verde/vermelho só serve junto: um sem o outro não define rampa nenhuma. */
function thresholdPairIsSane(green: unknown, red: unknown): green is number {
  return isFiniteNumber(green) && isFiniteNumber(red) && red >= 0 && red < green
}

export function effectiveAmber(preferences: RadarPreferences): number {
  return preferences.amber ?? (preferences.green + preferences.red) / 2
}

/** Leitura: nunca lança, sempre devolve algo utilizável. */
export function resolveRadarPreferences(value: unknown): RadarPreferences {
  if (!isRecord(value)) return { ...defaultRadarPreferences }

  const mode: RadarMode = value.mode === "today" ? "today" : "lookahead"

  const horizonDays =
    typeof value.horizonDays === "number" &&
    Number.isInteger(value.horizonDays) &&
    value.horizonDays >= MIN_HORIZON_DAYS &&
    value.horizonDays <= MAX_HORIZON_DAYS
      ? value.horizonDays
      : defaultRadarPreferences.horizonDays

  if (!thresholdPairIsSane(value.green, value.red)) {
    return {
      mode,
      horizonDays,
      green: defaultRadarPreferences.green,
      amber: defaultRadarPreferences.amber,
      red: defaultRadarPreferences.red,
    }
  }

  const green = value.green as number
  const red = value.red as number
  const amber =
    isFiniteNumber(value.amber) && value.amber > red && value.amber < green ? value.amber : null

  return { mode, horizonDays, green, amber, red }
}

export type RadarPreferencesValidation =
  | { ok: true; value: RadarPreferences }
  | { ok: false }

/**
 * Escrita: recusa em vez de consertar. A rota de moeda que já existe passa o corpo cru para o
 * serviço e devolve 200 com o valor trocado por padrão; para campo numérico isso esconde erro
 * de digitação do dono.
 */
export function validateRadarPreferences(value: unknown): RadarPreferencesValidation {
  if (!isRecord(value)) return { ok: false }
  if (value.mode !== "lookahead" && value.mode !== "today") return { ok: false }

  const { horizonDays, green, amber, red } = value

  if (
    typeof horizonDays !== "number" ||
    !Number.isInteger(horizonDays) ||
    horizonDays < MIN_HORIZON_DAYS ||
    horizonDays > MAX_HORIZON_DAYS
  ) {
    return { ok: false }
  }

  if (!isFiniteNumber(green) || !isFiniteNumber(red)) return { ok: false }
  if (red < 0 || red >= green) return { ok: false }

  if (amber !== null && amber !== undefined) {
    if (!isFiniteNumber(amber) || amber <= red || amber >= green) return { ok: false }
  }

  return {
    ok: true,
    value: {
      mode: value.mode,
      horizonDays,
      green,
      amber: amber === undefined ? null : amber,
      red,
    },
  }
}
