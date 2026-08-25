import { NextResponse } from "next/server"
import { NotificationLedgerMissingError } from "@/features/notifications/services/delivery-ledger.service"
import { runNotificationTick } from "@/features/notifications/services/run-tick.service"
import { isAuthorizedTick } from "@/features/notifications/services/tick-secret.service"

/**
 * A batida do despertador. Um serviço externo gratuito abre esta URL a cada 15
 * minutos; o app decide quem tem aviso vencendo agora e envia.
 *
 * Fechada por padrão: sem segredo guardado (nem variável de ambiente), recusa
 * tudo — a mesma disciplina do webhook do Telegram, que aceitava qualquer POST
 * antes da Etapa 0. Na demo a rota nem existe.
 *
 * Aceita GET e POST porque cada despertador gratuito faz de um jeito, e o
 * segredo pode vir no cabeçalho ou em `?key=` (metade deles não manda cabeçalho).
 */

export const dynamic = "force-dynamic"
// Fila com teto interno; 60s é o que a hospedagem dá e sobra para o lote.
export const maxDuration = 60

async function handle(request: Request) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return new NextResponse(null, { status: 404 })
  }

  if (!(await isAuthorizedTick(request))) {
    // i18n-ignore: resposta de máquina para máquina, nunca renderizada em UI
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 })
  }

  try {
    const result = await runNotificationTick()
    // i18n-ignore: relatório interno do tique, lido pelo despertador e pelo log
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    if (error instanceof NotificationLedgerMissingError) {
      // Banco ainda não preparado: sem o caderno de envios não dá para garantir
      // "uma vez só", então NADA é enviado — e a resposta diz exatamente isso.
      // i18n-ignore: resposta de máquina para máquina
      return NextResponse.json({ success: false, error: "databaseNotPrepared" }, { status: 409 })
    }
    console.error("[NOTIFICATIONS] tick failed:", error)
    // i18n-ignore: resposta de máquina para máquina
    return NextResponse.json({ success: false, error: "internalError" }, { status: 500 })
  }
}

export function GET(request: Request) {
  return handle(request)
}

export function POST(request: Request) {
  return handle(request)
}
