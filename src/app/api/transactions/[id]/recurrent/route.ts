import { NextResponse, type NextRequest } from "next/server"
import { getTranslations } from "next-intl/server"

import { getWriteContext } from "@/features/security/services/write-context"
import { makeRecurring } from "@/features/transactions/services/make-recurring"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t = await getTranslations("api")
  // Mesmo ator das rotas de lançamento. Fora da trava de datas de propósito (cria o modelo, não
  // grava lançamento), então o token de PIN não tem sentido e é descartado sem verificar.
  const ctx = await getWriteContext(request, { allowOverride: false })
  if (!ctx) {
    return NextResponse.json(
      { error: t("errors.notAuthenticated") },
      { status: 401 }
    )
  }

  const { id } = await params

  try {
    const recurring = await makeRecurring(id, ctx.ownerId)

    if (!recurring) {
      return NextResponse.json(
        { error: t("errors.transactionNotFound") },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, recurringTransaction: recurring })
  } catch (error) {
    console.error("Error creating recurring transaction:", error)
    return NextResponse.json(
      { error: t("transactions.recurrentFailed") },
      { status: 500 }
    )
  }
}
