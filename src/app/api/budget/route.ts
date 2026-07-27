import { NextRequest, NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import { getDefaultUserId } from "@/features/transactions/services/get-default-user-id"
import { getBudgetData } from "@/features/budget/services/get-budget-data"
import { resolveBudgetRange } from "@/features/budget/lib/period-range"

export async function GET(req: NextRequest) {
  const t = await getTranslations("api.errors")
  try {
    const userId = await getDefaultUserId()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const fromStr = searchParams.get("from")
    const toStr = searchParams.get("to")
    const dateStr = searchParams.get("date")
    
    // Datas chegam como data de calendário ("YYYY-MM-DD") e o range é sempre
    // fechado em meses inteiros — ver period-range.ts para o porquê.
    const range = resolveBudgetRange(fromStr ?? dateStr, toStr ?? dateStr, new Date())

    if (!range) {
      return NextResponse.json({ error: t("invalidDateFormat") }, { status: 400 })
    }

    const data = await getBudgetData(userId, range.from, range.to)

    return NextResponse.json(data)
  } catch (error) {
    console.error("Budget API error:", error)
    return NextResponse.json(
      { error: t("internalError") },
      { status: 500 }
    )
  }
}
