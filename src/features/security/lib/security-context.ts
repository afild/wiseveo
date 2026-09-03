/**
 * Fechamento de datas: o contexto da aba Segurança de Configurações, puro (sem banco, sem React).
 *
 * A aba aparece para QUALQUER sessão real, porque o estado do fechamento é informação de todo
 * mundo que enxerga a conta. O que muda de pessoa para pessoa é o que dá para mexer: `readOnly`
 * desliga os dois cartões (USER convidado, sessão de vitrine) e `canManagePin` esconde o cartão
 * do PIN de quem não é dono dos dados (um ADMIN convidado fecha e reabre, mas não troca a chave
 * da casa).
 *
 * `showcase` sai DAQUI, do ator, nunca da env `NEXT_PUBLIC_DEMO_MODE`: essa env vale tanto para a
 * vitrine quanto para a cópia do visitante, e o visitante manda na cópia dele.
 */
import { canManageClosing, canManagePin, type Actor } from "./permissions"

/**
 * O estado que a aba desenha: os cinco campos do contrato de `GET /api/security/date-closing`
 * mais `pinUpdatedAt`, que só a página monta (a rota não o devolve, e nem deve: quanto menos a
 * chave do PIN deixar vestígio na rede, melhor).
 */
export interface SecurityStateView {
  closedThrough: string | null
  hasPin: boolean
  canManageClosing: boolean
  canManagePin: boolean
  showcase: boolean
  /** Quando o PIN foi definido pela última vez, em ISO; null quando nunca houve PIN. */
  pinUpdatedAt?: string | null
}

export interface SecurityContext {
  /** Cartões desabilitados, só com os textos de estado. */
  readOnly: boolean
  /** Sessão de vitrine da demo: a aba ganha a faixa de demonstração. */
  showcase: boolean
  /** Mostra o cartão do PIN (só o dono dos dados). */
  canManagePin: boolean
  state: SecurityStateView
}

export function buildSecurityContext(actor: Actor, state: SecurityStateView): SecurityContext {
  return {
    readOnly: !canManageClosing(actor),
    showcase: actor.showcase,
    canManagePin: canManagePin(actor),
    state,
  }
}
