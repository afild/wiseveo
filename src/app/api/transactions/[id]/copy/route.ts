import { NextResponse, type NextRequest } from "next/server"
import { getTranslations } from "next-intl/server"

import { getWriteContext } from "@/features/security/services/write-context"
import { copyTransaction } from "@/features/transactions/services/copy-transaction"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t = await getTranslations("api")

  try {
    // Tarefa 8a: o contexto de escrita (ator + dono + token de PIN) substitui o userId solto.
    // A resposta 423 do DATE_CLOSED entra na Tarefa 8b.
    const ctx = await getWriteContext(request)
    if (!ctx) {
      return NextResponse.json(
        { error: t("errors.userNotFound") },
        { status: 401 }
      )
    }
    const userId = ctx.ownerId

    const { id } = await params

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: t("errors.invalidJson") }, { status: 400 })
    }

    if (!body.date) {
      return NextResponse.json(
        { error: t("errors.missingField", { field: "date" }) },
        { status: 400 }
      )
    }

    await copyTransaction(id, String(body.date), userId, ctx)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Copy Transaction]", error)
    const detail = error instanceof Error ? error.message : t("errors.internalError")
    return NextResponse.json(
      { error: `${t("transactions.copyFailed")}: ${detail}` },
      { status: 500 }
    )
  }
}
