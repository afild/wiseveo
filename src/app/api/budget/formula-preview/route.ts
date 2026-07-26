import { NextRequest, NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import { startOfMonth } from "date-fns"
import { getDefaultUserId } from "@/features/transactions/services/get-default-user-id"
import { getBudgetHistory } from "@/features/budget/services/get-budget-history"
import { calculateFormulaLimit, hasUsableHistory } from "@/features/budget/services/formula-engine"
import type { FormulaParams } from "@/features/budget/types"

/**
 * GET /api/budget/formula-preview
 *   ?scopeType=group|category & code=<groupCode|categoryCode>
 *   &formulaId=<id> & params=<JSON de FormulaParams>
 *   &from=<ISO opcional; default: início do mês corrente>
 * Reusa o MESMO pipeline da página (getBudgetHistory + calculateFormulaLimit)
 * para que preview e card nunca divirjam. Presets custom são resolvidos das
 * preferências do usuário no servidor.
 */
export async function GET(req: NextRequest) {
  const t = await getTranslations("api.errors")
  try {
    const userId = await getDefaultUserId()
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const sp = new URL(req.url).searchParams
    const scopeType = sp.get("scopeType")
    const codeRaw = sp.get("code")
    const formulaId = sp.get("formulaId")
    if ((scopeType !== "group" && scopeType !== "category") || !codeRaw || !formulaId) {
      return NextResponse.json({ error: t("invalidDateFormat") }, { status: 400 })
    }
    let params: FormulaParams = {}
    try {
      params = JSON.parse(sp.get("params") ?? "{}")
    } catch {
      return NextResponse.json({ error: t("invalidDateFormat") }, { status: 400 })
    }

    const fromStr = sp.get("from")
    const from = startOfMonth(fromStr ? new Date(fromStr) : new Date())
    const months = params.months ?? 6

    const { prisma } = await import("@/lib/prisma")
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { preferencesJson: true } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customPresets = ((user?.preferencesJson as any)?.budgetFormula?.customPresets) ?? []

    const code = scopeType === "group" ? Number(codeRaw) : codeRaw
    const history = await getBudgetHistory(userId, from, months, { type: scopeType, code })

    const usable = hasUsableHistory(formulaId, params, history)
    const monthlyLimit = usable ? calculateFormulaLimit(formulaId, params, history, customPresets) : 0

    return NextResponse.json({
      monthlyLimit,
      historyUsed: history.monthlySpent.slice(0, months),
      fallback: !usable || monthlyLimit <= 0,
    })
  } catch (error) {
    console.error("Formula preview API error:", error)
    return NextResponse.json({ error: t("internalError") }, { status: 500 })
  }
}
