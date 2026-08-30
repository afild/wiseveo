import { composeFromDossier } from "@/features/ai/services/response-composer.service"
import type { ResponseBlock } from "@/features/ai/types/response.types"
import { buildBulletinDossier, type BulletinKind } from "./bulletin-dossier.service"
import type { ZonedParts } from "../lib/schedule"
import type { NotificationContext } from "../types/notifications.types"

/**
 * O boletim.
 *
 * O trabalho pesado saiu daqui: os números vêm do dossiê (que agora traz o dia
 * lançamento a lançamento, o saldo em conta, os meses anteriores e o que está
 * por vencer) e o FORMATO é escolhido pela IA — card, tabela, gráfico, análise,
 * na ordem que ela achar melhor para aquele dia.
 *
 * Sem IA disponível o boletim continua saindo: o dossiê traz junto um card
 * determinístico com os mesmos números. Perde o comentário, não o conteúdo — a
 * degradação combinada desde a decisão de custo da Etapa 1.
 */

export type { BulletinKind }

/** A pauta de cada boletim: o que se espera daquela mensagem. */
function briefingFor(kind: BulletinKind): string {
  // Instruções para o MODELO, não texto de UI. i18n-ignore
  if (kind === "dailyDigest") {
    // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
    return `PAUTA: o boletim DIÁRIO. É a primeira coisa que a pessoa lê hoje sobre o dinheiro dela.
Mostre o movimento do DIA — os lançamentos, não só o total — e onde isso deixa o saldo em conta.
Depois diga o que muda nos próximos dias: o que vence, o que ainda não saiu, se o ritmo do mês preocupa.
Se o dia não teve movimento, diga isso em uma linha e passe ao que está por vir; não invente conteúdo.`
  }

  if (kind === "weeklyDigest") {
    // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
    return `PAUTA: o boletim SEMANAL, sobre os sete dias fechados.
Compare a semana com os meses anteriores da lista: o ritmo de gasto está acima, abaixo ou igual?
Aponte as maiores saídas e o que puxou o resultado. Um gráfico de barras ajuda quando há categorias
ou dias que se destacam. Termine com a semana que vem: o que está agendado e quanto pesa.`
  }

  // i18n-ignore: dado/instrução para o MODELO, não é texto de tela
  return `PAUTA: o boletim MENSAL, sobre o mês FECHADO.
É o balanço: como o mês terminou, como se compara com os anteriores e com a média, o que mudou de padrão.
Vale um gráfico comparando os últimos meses. Termine com uma leitura do que o mês diz sobre o próximo.`
}

export async function buildBulletin(input: {
  dataOwnerId: string
  kind: BulletinKind
  parts: ZonedParts
  ctx: NotificationContext
  audience: string
}): Promise<ResponseBlock[]> {
  const dossier = await buildBulletinDossier({
    dataOwnerId: input.dataOwnerId,
    kind: input.kind,
    parts: input.parts,
    ctx: input.ctx,
  })

  try {
    const blocks = await composeFromDossier({
      dossier: dossier.text,
      briefing: briefingFor(input.kind),
      ctx: { ...input.ctx, audience: input.audience },
    })
    if (blocks.length > 0) return blocks
  } catch (error) {
    // Sem detalhe no log: o erro cru de um provedor de IA pode trazer o pedido
    // inteiro, e com ele a chave. A camada de IA já registra qual provedor caiu.
    console.warn(`[NOTIFICATIONS] bulletin composition failed for ${input.kind}`)
    void error
  }

  return [dossier.fallback]
}
