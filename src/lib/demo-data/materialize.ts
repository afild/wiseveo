// WISEVEO — Materializador do dataset de demonstração.
//
// Mapeia o dataset ABSTRATO (códigos 100..900, "300.001") para UM usuário concreto,
// devolvendo linhas prontas para `createMany`. Aqui mora a premissa P13 ("sem danos
// aos dados de outros usuários"): TODO código sai prefixado/deslocado para o
// namespace do usuário-alvo — nunca os códigos globais padrão.
//
// Os textos deste arquivo são valores de coluna de DADO (REF/HISTÓRICO), não cópia de UI.

import crypto from "crypto"
import { FIXED_CUTOFF, type DemoDataset } from "./generate-demo-dataset"
import { CUTOFF_MODE, CHECKING_INITIAL_BALANCE, SAVINGS_INITIAL_BALANCE, OVERDUE_SHOWCASE } from "./catalog"
import { periodFromDate } from "../financial"

export type MaterializeCtx = {
  userId: string
  prefix: string                       // 8 hex chars — mesmo passado ao initializeUserData
  accountIds: Record<string, number>   // retorno do initializeUserData
  groupUuidByCode: Record<number, string> // groups do usuário: originalCode → UUID (query após init)
  groupCodeOffset: number              // phantomGroupCode = offset + originalCode (derivar dos groups criados)
  payeeIdBase: number                  // bloco reservado (MAX+1 sob LOCK, ver Tarefa 7)
  now?: Date                           // p/ CUTOFF_MODE dynamic
}

export function materializeDataset(ds: DemoDataset, ctx: MaterializeCtx) {
  const cutoff = CUTOFF_MODE === "dynamic" && ctx.now
    ? new Date(ctx.now.getTime() - 86400000)  // "até ontem"
    : FIXED_CUTOFF
  const checking = ctx.accountIds.CHECKING

  // payees: nome → id do bloco
  const payeeNames = [...new Set(ds.transactions.map((t) => t.payee))].sort()
  const payeeId = new Map(payeeNames.map((n, i) => [n, ctx.payeeIdBase + i]))
  const payees = payeeNames.map((name) => ({ id: payeeId.get(name)!, name, userId: ctx.userId }))

  // overdue showcase: 2 menores despesas variáveis nos 5 dias antes do corte
  const overdueIds = new Set<number>()
  if (OVERDUE_SHOWCASE) {
    ds.transactions
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t.type === "EXPENSE" && Math.abs(t.amount) <= 300 &&
        t.date <= cutoff && cutoff.getTime() - t.date.getTime() <= 5 * 86400000)
      .sort((a, b) => Math.abs(a.t.amount) - Math.abs(b.t.amount))
      .slice(0, 2)
      .forEach(({ i }) => overdueIds.add(i))
  }

  const transactions = ds.transactions.map((t, i) => ({
    id: crypto.randomUUID(),
    num: i + 1, // ds.transactions já é cronológico
    period: periodFromDate(t.date),
    date: t.date,
    // P14: REF = etiqueta curta; HISTÓRICO = detalhe com o favorecido; DESCRIÇÃO = rótulo principal
    reference: t.kind ? "MONTHLY" : t.description.toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 18), // i18n-ignore: valor de coluna de dado (REF), não é texto de UI
    note: `${t.description} — ${t.payee}`,
    description: t.description,
    amount: t.amount,
    type: t.type,
    userId: ctx.userId,
    accountId: checking,
    destAccountId: null as number | null,
    groupCode: ctx.groupCodeOffset + t.group,
    categoryCode: `${ctx.prefix}.${t.cat}`,
    statusCode: overdueIds.has(i) ? 3 : t.date <= cutoff ? 1 : 2,
    payeeId: payeeId.get(t.payee)!,
  }))

  const recurring = ds.recurringTemplates.map((r) => ({
    id: crypto.randomUUID(),
    period: r.period, note: r.description, description: r.description,
    amount: r.amount, type: r.type, userId: ctx.userId,
    accountId: checking, groupCode: ctx.groupCodeOffset + r.group,
    categoryCode: `${ctx.prefix}.${r.cat}`, statusCode: r.statusCode,
    payeeId: payeeId.get(r.payee) ?? null, lastDate: r.lastDate, reference: "RECURRING", // i18n-ignore: valor de coluna de dado (REF), não é texto de UI
  }))

  const budgets = ds.budgets.map((b) => ({
    id: crypto.randomUUID(), amount: b.amount, month: 7, year: 2026,
    groupId: ctx.groupUuidByCode[b.group], spent: 0, userId: ctx.userId,
  }))

  return {
    payees, transactions, recurring, budgets,
    accountBalances: { [checking]: CHECKING_INITIAL_BALANCE, [ctx.accountIds.SAVINGS]: SAVINGS_INITIAL_BALANCE },
  }
}
