export type ChartChoice = "existing" | "template"

/**
 * Ou o banco inteiro, ou o modelo padrão — nunca os dois. Quem decide é o estado do
 * banco conectado (tabela `transactions` existe = tem dados), não a pessoa: num banco
 * com histórico o modelo renomearia/reatribuiria o que colidir com os códigos
 * compartilhados; num banco vazio não há o que "usar na íntegra".
 */
export function resolveChartChoice(hasData: boolean): ChartChoice {
  return hasData ? "existing" : "template"
}
