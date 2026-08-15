// WISEVEO — Período inicial de cada rota quando não há nada salvo no navegador.
//
// Regra: mês corrente inteiro em toda parte; em /transactions, "hoje" (dia único,
// igual ao atalho "Hoje" do DatePicker) — a tabela navega por dia e o cartão de
// saldo mostra "saldo em <data>", então o dia do acesso é o ponto de partida natural.

import { endOfMonth, startOfDay, startOfMonth } from "date-fns"

export interface DefaultDateRange {
  from: Date
  to: Date
}

/** Rotas cujo período inicial é o dia de hoje (dia único). */
const SINGLE_DAY_SCOPES: readonly string[] = ["/transactions"]

export function isSingleDayScope(scope: string): boolean {
  return SINGLE_DAY_SCOPES.includes(scope)
}

/** Período inicial no fuso LOCAL de quem chama — é o valor definitivo, aplicado no cliente. */
export function getDefaultDateRange(scope: string, now: Date = new Date()): DefaultDateRange {
  if (isSingleDayScope(scope)) {
    const today = startOfDay(now)
    return { from: today, to: today }
  }
  return { from: startOfMonth(now), to: endOfMonth(now) }
}

/**
 * Período inicial SEGURO PARA HIDRATAÇÃO: mesma data-calendário no servidor (UTC na
 * Vercel) e no navegador (fuso local). Usa os componentes UTC de `now` para montar a
 * meia-noite LOCAL daquele dia — assim "dd/MM/yyyy", dia da semana e contagem de dias
 * batem nos dois lados. Serve só para o `useState` inicial do DateRangeProvider (SSR
 * + primeiro render); o effect de hidratação troca pelo `getDefaultDateRange` local
 * (ou pelo período salvo). Sem isso, em /transactions ("hoje" dia único) o texto
 * divergiria toda noite em fusos a oeste de UTC — erro de hidratação diário.
 */
export function getHydrationSafeDateRange(scope: string, now: Date = new Date()): DefaultDateRange {
  const anchor = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return getDefaultDateRange(scope, anchor)
}
