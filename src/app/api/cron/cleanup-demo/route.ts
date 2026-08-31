import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { refreshVitrineCutoffIfDue } from "@/features/demo/services/refresh-vitrine-cutoff.service"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * A faxina dos visitantes da demo.
 *
 * POR QUE ELA FOI REESCRITA: a versão anterior apagava UM usuário por vez, com
 * `prisma.user.delete`, no máximo 40 por execução — e o cron da Vercel gratuita
 * roda uma vez por dia. Cada visitante arrasta ~2.650 linhas em cascata. Com
 * mais de 40 visitantes por dia a fila só crescia, e cresceu: 1.198 visitantes
 * vencidos, 3,07 milhões de transações, 1,5 GB — até o banco entrar em modo
 * somente leitura e a demo parar de provisionar. A conta nunca fechou: o teto
 * era do tamanho errado e a frequência também.
 *
 * O QUE MUDOU:
 * 1. Apaga as TRANSAÇÕES primeiro, e só depois os usuários. Esta é a mudança que
 *    mais importa, e custou uma madrugada para ser descoberta: `categories` e
 *    `recurring_transactions` NÃO têm índice por `user_id`, então a cascata de
 *    cada categoria apagada varria a tabela inteira de transações — 23 minutos
 *    sem conseguir apagar 25 visitantes. Removendo as transações antes, pelo
 *    índice `(user_id, DATA)` que existe, o mesmo trabalho leva ~6 segundos por
 *    100 mil linhas. Depois disso a cascata do usuário fica barata, porque já
 *    não há o que varrer.
 * 2. Trabalha por TEMPO, não por contagem fixa: enquanto houver folga no minuto
 *    de execução, pega o próximo lote. Uma execução limpa o que couber e diz
 *    quanto sobrou.
 * 3. Pode ser chamada de 15 em 15 minutos por um despertador externo — o mesmo
 *    truque dos boletins. Sem isso, uma vez por dia nunca alcança a fila.
 *
 * Continua com as duas travas de sempre: só roda com a demo ligada, e o filtro
 * exige e-mail começando com "demo_" — nunca encosta num usuário real.
 */

/** Quantos visitantes por lote. Cada um arrasta ~2.650 linhas em cascata. */
const BATCH_SIZE = 40
/** Para de começar lote novo aqui, para terminar o que começou dentro do minuto. */
const TIME_BUDGET_MS = 45_000
/** Visitante mais velho que isto já não interessa a ninguém. */
const STALE_HOURS = 25

export async function GET(request: Request) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
    // i18n-ignore: endpoint de cron interno, resposta nunca renderizada em UI
    return NextResponse.json({ skipped: true, reason: "Demo mode is disabled" }, { status: 200 })
  }

  const authHeader = request.headers.get("authorization")
  const queryKey = new URL(request.url).searchParams.get("key")
  const secret = process.env.CRON_SECRET
  const authorized =
    Boolean(secret) && (authHeader === `Bearer ${secret}` || queryKey === secret)
  if (!authorized && process.env.NODE_ENV === "production") {
    // i18n-ignore: resposta de máquina para máquina
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  // Uma vez por dia, pegando carona na batida de 15 min: a vitrine não pode
  // envelhecer (o corte pago/pendente dela é recalculado aqui).
  const refreshed = await refreshVitrineCutoffIfDue().catch((e) => {
    console.error("Vitrine cutoff refresh failed:", e)
    return false
  })

  const startedAt = Date.now()
  const cutoff = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000)
  let deleted = 0
  let batches = 0

  try {
    while (Date.now() - startedAt < TIME_BUDGET_MS) {
      const stale = await prisma.user.findMany({
        // Trava dupla: o prefixo do e-mail é a garantia de que nenhum usuário
        // real entra na lista, mesmo que a data diga outra coisa.
        where: { email: { startsWith: "demo_" }, createdAt: { lt: cutoff } },
        select: { id: true },
        take: BATCH_SIZE,
      })
      if (stale.length === 0) break
      const ids = stale.map((user) => user.id)

      // 1) As transações, pelo índice. É o grosso do volume e o que torna toda
      //    a cascata seguinte cara enquanto estiver lá.
      await prisma.transaction.deleteMany({ where: { userId: { in: ids } } })

      // 2) Agora o usuário: o resto (recorrentes, orçamentos, categorias,
      //    contas, favorecidos) sai pela cascata do banco, já barata.
      const result = await prisma.user.deleteMany({ where: { id: { in: ids } } })
      deleted += result.count
      batches += 1
    }

    const remaining = await prisma.user.count({
      where: { email: { startsWith: "demo_" }, createdAt: { lt: cutoff } },
    })

    // O que sobrou vai no relatório: fila encolhendo em silêncio é o que
    // escondeu o problema por semanas.
    // i18n-ignore: relatório interno do cron
    return NextResponse.json({ success: true, deleted, batches, remaining, refreshed })
  } catch (error) {
    console.error("Cron Cleanup Error:", error)
    // i18n-ignore: resposta de máquina para máquina
    return NextResponse.json({ error: "internalError", deleted }, { status: 500 })
  }
}
