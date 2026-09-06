import { NextResponse } from "next/server"
import { NotificationLedgerMissingError } from "@/features/notifications/services/delivery-ledger.service"
import { isAuthorizedTick } from "@/features/notifications/services/tick-secret.service"
import { runBackup } from "@/features/backup/services/run-backup.service"

/**
 * Batida do despertador para o backup. O mesmo serviço externo que chama /api/cron/tick a
 * cada 15 min chama esta rota com o MESMO segredo; a decisão de rodar ou não é do
 * orquestrador. Na demo a rota não existe.
 *
 * 300 s é o teto do Fluid compute no Hobby; o ciclo inteiro (sandbox + dump + upload)
 * precisa caber aqui, e o Sandbox tem timeout próprio de 240 s.
 */
export const dynamic = "force-dynamic"
export const maxDuration = 300

async function handle(request: Request) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return new NextResponse(null, { status: 404 })
  }
  if (!(await isAuthorizedTick(request))) {
    // i18n-ignore: resposta de máquina para máquina, nunca renderizada em UI
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 })
  }
  try {
    const result = await runBackup({ trigger: "tick" })
    // i18n-ignore: relatório interno, lido pelo despertador e pelo log
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    if (error instanceof NotificationLedgerMissingError) {
      // i18n-ignore: resposta de máquina para máquina
      return NextResponse.json({ success: false, error: "databaseNotPrepared" }, { status: 409 })
    }
    console.error("[BACKUP] cron failed:", error) // i18n-ignore: prefixo de log de servidor, nunca exibido em tela
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
