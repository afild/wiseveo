import { prisma } from "@/lib/prisma"
import { startOfMonth, endOfMonth, addMonths } from "date-fns"
import type {
  BudgetItem,
  BudgetPageData,
  BudgetFormulaPreferences,
  GroupWithCategories,
  FormulaConfig,
} from "../types"
import { getBudgetHistory } from "./get-budget-history"
import {
  calculateFormulaLimit,
  hasUsableHistory,
  DEFAULT_FORMULA_CONFIG,
} from "./formula-engine"
import { computeTotals } from "../lib/totals"
import { dedupCustomCardMembers } from "../lib/custom-card-members"
import { periodFromDate } from "@/lib/financial"

// Chaves de dados: nomes de grupos vindos do banco (pt), usados só para casar emoji.
const GROUP_EMOJI_MAP: Record<string, string> = {
  receitas: "💰",
  "habitação": "🏠", // i18n-ignore — chave de dado (nome de grupo no banco), não é UI
  "habitacao": "🏠",
  "alimentação": "🍔", // i18n-ignore — chave de dado (nome de grupo no banco), não é UI
  alimentacao: "🍔",
  "saúde": "🏥", // i18n-ignore — chave de dado (nome de grupo no banco), não é UI
  saude: "🏥",
  "educação": "🎓", // i18n-ignore — chave de dado (nome de grupo no banco), não é UI
  educacao: "🎓",
  transporte: "🚗",
  "vestuário": "👕", // i18n-ignore — chave de dado (nome de grupo no banco), não é UI
  vestuario: "👕",
  "serviços": "🛠️", // i18n-ignore — chave de dado (nome de grupo no banco), não é UI
  servicos: "🛠️",
  lazer: "🎭",
  turismo: "✈️",
  pet: "🐾",
  impostos: "🏛️",
  "outras despesas": "📦",
  "caixa e captação": "💳", // i18n-ignore — chave de dado (nome de grupo no banco), não é UI
  "caixa e captacao": "💳",
  financeira: "📊",
}

function getMonthsInRange(from: Date, to: Date): number {
  const years = to.getFullYear() - from.getFullYear()
  const months = to.getMonth() - from.getMonth()
  return years * 12 + months + 1
}

function countFutureMonths(from: Date, to: Date): number {
  const endOfCurrentMonth = endOfMonth(new Date())
  if (to <= endOfCurrentMonth) return 0
  if (from > endOfCurrentMonth) return getMonthsInRange(from, to)
  const futureStart = startOfMonth(addMonths(endOfCurrentMonth, 1))
  return getMonthsInRange(futureStart, to)
}

export async function getBudgetData(
  userId: string,
  referenceDateFrom?: Date,
  referenceDateTo?: Date
): Promise<BudgetPageData> {
  const filterFrom = referenceDateFrom ?? startOfMonth(new Date())
  const filterTo = referenceDateTo ?? endOfMonth(filterFrom)

  const monthsInRange = getMonthsInRange(filterFrom, filterTo)
  const futureMonths = countFutureMonths(filterFrom, filterTo)

  // 1. Fetch expense groups with their categories
  const groups = await prisma.categoryGroup.findMany({
    where: { type: "EXPENSE", userId },
    include: { categories: true },
    orderBy: { code: "asc" },
  })

  // 2. Fetch latest budget configured for each group/category (latest wins)
  const allBudgets = await prisma.budget.findMany({
    where: { userId },
    orderBy: [
      { updatedAt: "desc" },
      { year: "desc" },
      { month: "desc" },
    ],
  })

  const latestGroupBudgetMap = new Map<
    string,
    { amount: number; rule: string | null; customName: string | null }
  >()
  const latestCatBudgetMap = new Map<
    string,
    { amount: number; rule: string | null; customName: string | null }
  >()

  for (const b of allBudgets) {
    if (b.categoryId) {
      if (!latestCatBudgetMap.has(b.categoryId)) {
        if (b.spent === -1 || b.amount > 0) {
          latestCatBudgetMap.set(b.categoryId, {
            amount: b.amount,
            rule: b.rule,
            customName: b.customName || null,
          })
        }
      }
    } else if (b.groupId) {
      if (!latestGroupBudgetMap.has(b.groupId)) {
        if (b.amount > 0 || b.rule !== null || b.customName) {
          latestGroupBudgetMap.set(b.groupId, {
            amount: b.amount,
            rule: b.rule,
            customName: b.customName || null,
          })
        }
      }
    }
  }

  // 3. Aggregate real spent from transactions for the selected range
  // Two parallel queries: all expenses, and paid-only (status "Pago")
  const [spentAggregation, paidAggregation] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["groupCode", "categoryCode"],
      _sum: { amount: true },
      where: {
        userId,
        type: "EXPENSE",
        date: { gte: filterFrom, lte: filterTo },
      },
    }),
    prisma.transaction.groupBy({
      by: ["groupCode", "categoryCode"],
      _sum: { amount: true },
      where: {
        userId,
        type: "EXPENSE",
        date: { gte: filterFrom, lte: filterTo },
        statusLookup: { name: { equals: "Pago", mode: "insensitive" } },
      },
    }),
  ])

  const spentGroupMap = new Map<number, number>()
  const spentCatMap = new Map<string, number>()

  for (const exp of spentAggregation) {
    const amt = Math.abs(exp._sum.amount || 0)
    if (exp.groupCode) {
      spentGroupMap.set(
        exp.groupCode,
        (spentGroupMap.get(exp.groupCode) || 0) + amt
      )
    }
    if (exp.categoryCode) {
      spentCatMap.set(
        exp.categoryCode,
        (spentCatMap.get(exp.categoryCode) || 0) + amt
      )
    }
  }

  const paidGroupMap = new Map<number, number>()
  const paidCatMap = new Map<string, number>()

  for (const exp of paidAggregation) {
    const amt = Math.abs(exp._sum.amount || 0)
    if (exp.groupCode) {
      paidGroupMap.set(
        exp.groupCode,
        (paidGroupMap.get(exp.groupCode) || 0) + amt
      )
    }
    if (exp.categoryCode) {
      paidCatMap.set(
        exp.categoryCode,
        (paidCatMap.get(exp.categoryCode) || 0) + amt
      )
    }
  }

  // 4. Read formula preferences
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferencesJson: true },
  })

  const preferences = (user?.preferencesJson as Record<string, any>) || {}
  const budgetOrder = (preferences.budgetOrder as string[]) || []

  const formulaConfig: BudgetFormulaPreferences = preferences.budgetFormula || {
    global: DEFAULT_FORMULA_CONFIG,
    perCard: {},
    customPresets: [],
    customCards: [],
  }

  // 5. Determine max months needed for history queries
  const globalMonths = formulaConfig.global.params.months ?? 3
  const allMonths = [
    globalMonths,
    ...Object.values(formulaConfig.perCard).map(
      (c: FormulaConfig) => c.params.months ?? 3
    ),
  ]
  const maxMonths = Math.max(...allMonths, 3)

  // 6. Build budget items with formula-based limits
  const items: BudgetItem[] = []

  for (const group of groups) {
    const budgetSetup = latestGroupBudgetMap.get(group.id)
    const spent = spentGroupMap.get(group.code) || 0
    const firstCatIcon = (group as any).categories?.[0]?.icon
    const groupEmoji =
      GROUP_EMOJI_MAP[group.name.toLowerCase()] || firstCatIcon || "📁"

    // Determine formula for this card
    const cardFormula = formulaConfig.perCard[group.id]
    const activeFormula = cardFormula || formulaConfig.global
    const isCustomFormula = !!cardFormula

    // Calculate limit via formula or use saved amount as fallback
    let limit = budgetSetup?.amount || 0
    let hasHistory = false
    let limitSource: "formula" | "fallback" | "none" = budgetSetup?.amount ? "fallback" : "none"
    let limitBreakdown: BudgetItem["limitBreakdown"]

    if (activeFormula.id !== "fixed_target") {
      // Referência = início do range; getBudgetHistory exclui o próprio mês da
      // referência, então o slot 0 é o mês fechado imediatamente anterior ao range.
      const historyReferenceDate = filterFrom

      const history = await getBudgetHistory(userId, historyReferenceDate, maxMonths, {
        type: "group",
        code: group.code,
      })
      hasHistory = hasUsableHistory(activeFormula.id, activeFormula.params, history)

      if (hasHistory) {
        const formulaLimit = calculateFormulaLimit(
          activeFormula.id,
          activeFormula.params,
          history,
          formulaConfig.customPresets
        )
        if (formulaLimit > 0) {
          limit = formulaLimit * monthsInRange
          limitSource = "formula"
          limitBreakdown = {
            monthlyLimit: formulaLimit,
            monthsInRange,
            historyUsed: history.monthlySpent.slice(0, activeFormula.params.months ?? 6),
          }
        }
      }
    } else {
      // Fixed target uses the params.amount directly
      hasHistory = true
      const formulaLimit = calculateFormulaLimit(
        activeFormula.id,
        activeFormula.params,
        { monthlySpent: [], monthlyIncome: [] },
        formulaConfig.customPresets
      )
      if (formulaLimit > 0) {
        limit = formulaLimit * monthsInRange
        limitSource = "formula"
        limitBreakdown = { monthlyLimit: formulaLimit, monthsInRange, historyUsed: [] }
      }
    }

    const paidForGroup = paidGroupMap.get(group.code) || 0
    const scheduledForGroup = Math.max(0, spent - paidForGroup)

    const projectedFutureGroup =
      futureMonths > 0 && limit > 0 && monthsInRange > 0
        ? (limit / monthsInRange) * futureMonths
        : 0

    items.push({
      id: group.id,
      name: budgetSetup?.customName || group.name,
      originalName: group.name,
      icon: groupEmoji,
      limit,
      spent,
      paidAmount: paidForGroup,
      projectedAmount: projectedFutureGroup,
      scheduledAmount: scheduledForGroup,
      isGroup: true,
      formulaId: activeFormula.id,
      hasHistory,
      isCustomFormula,
      hasFutureProjection: projectedFutureGroup > 0,
      amountSetting: budgetSetup?.amount || 0,
      groupId: group.id,
      categoryId: undefined,
      includeInTotals: true,
      limitSource,
      limitBreakdown,
    })

    // Category-level budgets (only if individually configured)
    for (const cat of group.categories) {
      if (latestCatBudgetMap.has(cat.id)) {
        const catSetup = latestCatBudgetMap.get(cat.id)!
        const catSpent = spentCatMap.get(cat.code) || 0

        const catFormula = formulaConfig.perCard[cat.id]
        const activeCatFormula = catFormula || formulaConfig.global
        const isCatCustom = !!catFormula

        let catLimit = catSetup.amount || 0
        let catHasHistory = false
        let catLimitSource: "formula" | "fallback" | "none" = catSetup.amount ? "fallback" : "none"
        let catLimitBreakdown: BudgetItem["limitBreakdown"]

        if (activeCatFormula.id !== "fixed_target") {
          // Referência = início do range; getBudgetHistory exclui o próprio mês da
          // referência, então o slot 0 é o mês fechado imediatamente anterior ao range.
          const historyReferenceDate = filterFrom
          const catHistory = await getBudgetHistory(
            userId,
            historyReferenceDate,
            maxMonths,
            { type: "category", code: cat.code }
          )
          catHasHistory = hasUsableHistory(activeCatFormula.id, activeCatFormula.params, catHistory)

          if (catHasHistory) {
            const catFormulaLimit = calculateFormulaLimit(
              activeCatFormula.id,
              activeCatFormula.params,
              catHistory,
              formulaConfig.customPresets
            )
            if (catFormulaLimit > 0) {
              catLimit = catFormulaLimit * monthsInRange
              catLimitSource = "formula"
              catLimitBreakdown = {
                monthlyLimit: catFormulaLimit,
                monthsInRange,
                historyUsed: catHistory.monthlySpent.slice(0, activeCatFormula.params.months ?? 6),
              }
            }
          }
        } else {
          catHasHistory = true
          const catFormulaLimit = calculateFormulaLimit(
            activeCatFormula.id,
            activeCatFormula.params,
            { monthlySpent: [], monthlyIncome: [] },
            formulaConfig.customPresets
          )
          if (catFormulaLimit > 0) {
            catLimit = catFormulaLimit * monthsInRange
            catLimitSource = "formula"
            catLimitBreakdown = { monthlyLimit: catFormulaLimit, monthsInRange, historyUsed: [] }
          }
        }

        const paidForCat = paidCatMap.get(cat.code) || 0
        const scheduledForCat = Math.max(0, catSpent - paidForCat)

        const projectedFutureCat =
          futureMonths > 0 && catLimit > 0 && monthsInRange > 0
            ? (catLimit / monthsInRange) * futureMonths
            : 0

        items.push({
          id: cat.id,
          name: catSetup.customName || cat.name,
          originalName: cat.name,
          icon: "📌",
          limit: catLimit,
          spent: catSpent,
          paidAmount: paidForCat,
          projectedAmount: projectedFutureCat,
          scheduledAmount: scheduledForCat,
          isGroup: false,
          parentGroupId: group.id,
          formulaId: activeCatFormula.id,
          hasHistory: catHasHistory,
          isCustomFormula: isCatCustom,
          hasFutureProjection: projectedFutureCat > 0,
          amountSetting: catSetup.amount || 0,
          groupId: group.id,
          categoryId: cat.id,
          includeInTotals: false,
          limitSource: catLimitSource,
          limitBreakdown: catLimitBreakdown,
        })
      }
    }
  }

  // 6.5 Add aggregated Custom Cards
  const customCards = formulaConfig.customCards || []
  for (const cCard of customCards) {
    const members = dedupCustomCardMembers(cCard, groups)
    let spent = 0

    // Referência = início do range; getBudgetHistory exclui o próprio mês da
    // referência, então o slot 0 é o mês fechado imediatamente anterior ao range.
    const historyReferenceDate = filterFrom
    const historyPromises: Promise<any>[] = []

    for (const catId of members.categoryIds) {
      const cat = groups.flatMap((g) => g.categories).find((c) => c.id === catId)
      if (cat) {
        spent += spentCatMap.get(cat.code) || 0
        historyPromises.push(
          getBudgetHistory(userId, historyReferenceDate, maxMonths, { type: "category", code: cat.code })
        )
      }
    }
    for (const groupId of members.groupIds) {
      const grp = groups.find((g) => g.id === groupId)
      if (grp) {
        spent += spentGroupMap.get(grp.code) || 0
        historyPromises.push(
          getBudgetHistory(userId, historyReferenceDate, maxMonths, { type: "group", code: grp.code })
        )
      }
    }

    const histories = await Promise.all(historyPromises)
    const aggregatedHistory = {
      monthlySpent: Array(maxMonths).fill(0),
      monthlyIncome: Array(maxMonths).fill(0), // Income doesn't aggregate from expense histories usually, we can just use the first one's income
    }
    
    if (histories.length > 0) {
      aggregatedHistory.monthlyIncome = [...histories[0].monthlyIncome]
      for (const h of histories) {
        for (let i = 0; i < maxMonths; i++) {
          if (h.monthlySpent[i]) aggregatedHistory.monthlySpent[i] += h.monthlySpent[i]
        }
      }
    }

    const cardFormula = formulaConfig.perCard[cCard.id]
    const activeFormula = cardFormula || formulaConfig.global
    const isCustomFormula = !!cardFormula

    let limit = cCard.amount || 0
    let hasHistory = hasUsableHistory(activeFormula.id, activeFormula.params, aggregatedHistory)
    let cCardLimitSource: "formula" | "fallback" | "none" = cCard.amount ? "fallback" : "none"
    let cCardLimitBreakdown: BudgetItem["limitBreakdown"]

    if (activeFormula.id !== "fixed_target") {
      if (hasHistory) {
        const formulaLimit = calculateFormulaLimit(
          activeFormula.id,
          activeFormula.params,
          aggregatedHistory,
          formulaConfig.customPresets
        )
        if (formulaLimit > 0) {
          limit = formulaLimit * monthsInRange
          cCardLimitSource = "formula"
          cCardLimitBreakdown = {
            monthlyLimit: formulaLimit,
            monthsInRange,
            historyUsed: aggregatedHistory.monthlySpent.slice(0, activeFormula.params.months ?? 6),
          }
        }
      }
    } else {
      hasHistory = true
      const formulaLimit = calculateFormulaLimit(
        activeFormula.id,
        activeFormula.params,
        { monthlySpent: [], monthlyIncome: [] },
        formulaConfig.customPresets
      )
      if (formulaLimit > 0) {
        limit = formulaLimit * monthsInRange
        cCardLimitSource = "formula"
        cCardLimitBreakdown = { monthlyLimit: formulaLimit, monthsInRange, historyUsed: [] }
      }
    }

    let paidForCard = 0
    for (const catId of members.categoryIds) {
      const cat = groups.flatMap((g) => g.categories).find((c) => c.id === catId)
      if (cat) paidForCard += paidCatMap.get(cat.code) || 0
    }
    for (const groupId of members.groupIds) {
      const grp = groups.find((g) => g.id === groupId)
      if (grp) paidForCard += paidGroupMap.get(grp.code) || 0
    }
    const scheduledForCard = Math.max(0, spent - paidForCard)

    const projectedFutureCard =
      futureMonths > 0 && limit > 0 && monthsInRange > 0
        ? (limit / monthsInRange) * futureMonths
        : 0

    items.push({
      id: cCard.id,
      name: cCard.name,
      // Sentinela de dados (também consumida pelo Telegram); a UI traduz
      // cartões agregados via budget.itemCard.multiple no display site.
      originalName: "Múltiplos", // i18n-ignore
      icon: "🗂️",
      limit,
      spent,
      paidAmount: paidForCard,
      projectedAmount: projectedFutureCard,
      scheduledAmount: scheduledForCard,
      isGroup: true,
      formulaId: activeFormula.id,
      hasHistory,
      isCustomFormula,
      hasFutureProjection: projectedFutureCard > 0,
      amountSetting: cCard.amount || 0,
      groupIds: cCard.groupIds,
      categoryIds: cCard.categoryIds,
      includeInTotals: false,
      limitSource: cCardLimitSource,
      limitBreakdown: cCardLimitBreakdown,
    })
  }

  // 7. Sort items based on saved order (if exists) or fallback to name
  if (budgetOrder.length > 0) {
    items.sort((a, b) => {
      const indexA = budgetOrder.indexOf(a.id)
      const indexB = budgetOrder.indexOf(b.id)

      if (indexA !== -1 && indexB !== -1) return indexA - indexB
      if (indexA !== -1) return -1
      if (indexB !== -1) return 1
      return a.name.localeCompare(b.name)
    })
  } else {
    items.sort((a, b) => a.name.localeCompare(b.name))
  }

  const totals = computeTotals(items)

  // 8. Build groups data for the CreateBudgetDialog
  const groupsData: GroupWithCategories[] = groups.map((g) => ({
    id: g.id,
    name: g.name,
    code: g.code,
    categories: g.categories.map((c) => ({
      id: c.id,
      name: c.name,
      code: c.code,
    })),
  }))

  return {
    items,
    ...totals,
    formulaConfig,
    groups: groupsData,
  }
}
