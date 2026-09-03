import { NextResponse, type NextRequest } from "next/server"
import { getTranslations } from "next-intl/server"

import { respondSecurityError } from "@/features/security/lib/http"
import { getDateClosingState } from "@/features/security/services/date-closing.service"
import { getWriteContext } from "@/features/security/services/write-context"

export const dynamic = "force-dynamic"

/**
 * Estado do fechamento para a sessão atual: corte, se há PIN e o que esta pessoa pode fazer.
 * Devolve os CINCO campos do contrato (desenho, seção 8) e mais nada — o hash do PIN e o
 * contador de erros continuam onde nasceram, dentro de `preferences_json`.
 *
 * Sem `allowOverride`: aqui não se escreve nada, então o cabeçalho de PIN não teria o que
 * autorizar. Não há 403: a leitura é de todo mundo com sessão, e quem não manda recebe os
 * booleanos em `false` (a vitrine, inclusive).
 */
export async function GET(request: NextRequest) {
  const t = await getTranslations("api")
  const ctx = await getWriteContext(request, { allowOverride: false })
  if (!ctx) {
    return NextResponse.json({ error: t("errors.notAuthenticated") }, { status: 401 })
  }

  try {
    return NextResponse.json(await getDateClosingState(ctx))
  } catch (error) {
    const failed = respondSecurityError(error, t)
    if (failed) return failed
    console.error("Error reading date closing state:", error)
    return NextResponse.json({ error: t("errors.internalError") }, { status: 500 })
  }
}
