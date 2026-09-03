/**
 * Decisão pura do fechamento inicial (scripts/close-dates.ts): simular, gravar ou recusar.
 *
 * Fica separada do script porque é a única parte que dá para conferir sem banco — e é ela que
 * decide se a linha do dono vai ser tocada. Duas garantias moram aqui:
 * - sem `--apply` a resposta NUNCA é "apply": o padrão do script é simulação;
 * - `through` anterior ao corte atual é reabertura, e reabrir é gesto do app, com PIN, nunca de
 *   um script rodado à mão. Igual a `closeThrough` no serviço: recuar recusa, empatar não faz nada.
 *
 * As datas são chaves "YYYY-MM-DD", então comparar como texto é comparar cronologicamente.
 */
export interface ClosePlanInput {
  closedThrough: string | null
  through: string
  blockersCount: number
  apply: boolean
}

export type ClosePlan =
  | { action: "simulate" }
  | { action: "apply" }
  | { action: "refuse"; reason: "blockers" | "wouldReopen" | "noop" }

export function planCloseDates(input: ClosePlanInput): ClosePlan {
  if (input.closedThrough !== null && input.through < input.closedThrough) {
    return { action: "refuse", reason: "wouldReopen" }
  }
  if (input.closedThrough !== null && input.through === input.closedThrough) {
    return { action: "refuse", reason: "noop" }
  }
  if (input.blockersCount > 0) return { action: "refuse", reason: "blockers" }
  return input.apply ? { action: "apply" } : { action: "simulate" }
}
