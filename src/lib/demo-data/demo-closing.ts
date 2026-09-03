/**
 * WISEVEO — corte inicial de fechamento da DEMO (vitrine e cópias de visitante).
 *
 * A demo planta de propósito duas despesas VENCIDAS nos dias antes de ontem (OVERDUE_SHOWCASE em
 * catalog.ts): pagar uma delas é o gesto mais comum de quem visita. Um corte "até ontem" — o
 * padrão natural, igual ao do materializador — prenderia justamente essas linhas dentro do período
 * fechado, e a demo abriria pedindo PIN no primeiro clique.
 *
 * Daí a regra: o corte é o DIA ANTERIOR ao não pago mais antigo, e nunca depois de ontem. O estado
 * inicial sai reprodutível pelo caminho normal (é um fechamento comum, que a pessoa pode desfazer
 * na aba Segurança) e nenhum vencido nasce trancado.
 *
 * Puro de propósito: nenhum banco, nenhuma decisão de status. Quem chama é que resolve o que é
 * "não pago", e sempre pelo NOME do status (src/lib/paid-status.ts), nunca pelo código numérico.
 */
import { addDays, dayKeyOfStored } from "@/features/security/lib/date-closing"

/** Dia anterior ao não pago mais antigo; sem não pagos, ontem (mesmo corte do materializador). */
export function computeDemoClosedThrough(unpaidDates: Date[], now: Date): string {
  const yesterday = addDays(dayKeyOfStored(now), -1)
  if (unpaidDates.length === 0) return yesterday
  const earliest = unpaidDates.reduce((a, b) => (a < b ? a : b))
  const candidate = addDays(dayKeyOfStored(earliest), -1)
  return candidate < yesterday ? candidate : yesterday
}
