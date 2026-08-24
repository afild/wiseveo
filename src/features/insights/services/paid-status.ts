/**
 * Critério de "pago" dos insights — agora a definição ÚNICA do sistema, em
 * `src/lib/paid-status.ts`. Este arquivo continua existindo só para não quebrar
 * os importes dos KPIs.
 */
export { PAID_STATUS_NAMES, paidStatusFilter, unpaidStatusFilter } from "@/lib/paid-status"
