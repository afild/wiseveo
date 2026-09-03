/**
 * Decisão pura do fechamento inicial (scripts/close-dates.ts): simular, gravar ou recusar.
 *
 * Fica separada do script porque é a única parte que dá para conferir sem banco — e é ela que
 * decide se a linha do dono vai ser tocada. Três garantias moram aqui:
 * - sem `--apply` a resposta NUNCA é "apply": o padrão do script é simulação;
 * - sem PIN a resposta NUNCA é "apply" nem "simulate": fechar sem PIN é trancar sem ter a chave,
 *   porque reabrir data pede o PIN. É a mesma recusa que o app faz (428 `pinNotSet`);
 * - `through` anterior ao corte atual é reabertura, e reabrir é gesto do app, com PIN, nunca de
 *   um script rodado à mão. Igual a `closeThrough` no serviço: recuar recusa, empatar não faz nada.
 *
 * A ORDEM das recusas é a mesma do serviço (`closeThrough`): PIN, depois nada-a-fazer/reabertura,
 * e bloqueadores por último. Quem roda precisa ouvir primeiro o que impede o fechamento inteiro.
 *
 * O script chama esta função DUAS vezes: uma para mostrar o quadro a quem está rodando, e outra
 * dentro da transação que grava, com a linha do dono travada e os bloqueadores recontados. É por
 * isso que ela não guarda estado nenhum: a segunda resposta pode ser diferente da primeira, e é a
 * segunda que manda.
 *
 * As datas são chaves "YYYY-MM-DD", então comparar como texto é comparar cronologicamente.
 */
export interface ClosePlanInput {
  closedThrough: string | null
  through: string
  blockersCount: number
  /** `false` = não há PIN gravado no banco. Recusa antes de qualquer outra coisa. */
  hasPin: boolean
  apply: boolean
}

export type ClosePlan =
  | { action: "simulate" }
  | { action: "apply" }
  | { action: "refuse"; reason: "pinNotSet" | "blockers" | "wouldReopen" | "noop" }

export function planCloseDates(input: ClosePlanInput): ClosePlan {
  if (!input.hasPin) return { action: "refuse", reason: "pinNotSet" }
  if (input.closedThrough !== null && input.through < input.closedThrough) {
    return { action: "refuse", reason: "wouldReopen" }
  }
  if (input.closedThrough !== null && input.through === input.closedThrough) {
    return { action: "refuse", reason: "noop" }
  }
  if (input.blockersCount > 0) return { action: "refuse", reason: "blockers" }
  return input.apply ? { action: "apply" } : { action: "simulate" }
}
