"use server"

import { prisma } from "@/lib/prisma"
import { getWriteActor } from "@/features/security/services/write-context"
import {
  setUserPreferenceKey,
  writeUserPreferenceKeys,
} from "@/features/settings/services/user-preferences-write"
import type { BudgetFormulaPreferences, FormulaConfig } from "../types"

/**
 * Save the global formula configuration to preferencesJson.
 */
export async function saveBudgetFormula(config: BudgetFormulaPreferences) {
  // Mesmo ator das rotas de lançamento: as fórmulas são da CONTA (actor.ownerId), não da pessoa.
  const actor = await getWriteActor()
  if (!actor) throw new Error("User not found") // i18n-ignore: código de erro interno do service layer (rota traduz, service retorna código estável)

  await setUserPreferenceKey(prisma, actor.ownerId, "budgetFormula", config)
}

/**
 * Save a per-card formula override (or remove it to revert to global).
 */
export async function saveCardFormula(
  cardId: string,
  formula: FormulaConfig | null
) {
  // Mesmo ator das rotas de lançamento: as fórmulas são da CONTA (actor.ownerId), não da pessoa.
  const actor = await getWriteActor()
  if (!actor) throw new Error("User not found") // i18n-ignore: código de erro interno do service layer (rota traduz, service retorna código estável)

  const user = await prisma.user.findUnique({
    where: { id: actor.ownerId },
    select: { preferencesJson: true },
  })

  const preferences = (user?.preferencesJson as Record<string, any>) || {}
  const budgetFormula = preferences.budgetFormula || {
    global: { id: "simple_avg", params: { months: 3, containment: 0 } },
    perCard: {},
  }

  if (formula === null) {
    delete budgetFormula.perCard[cardId]
  } else {
    budgetFormula.perCard[cardId] = formula
  }

  await setUserPreferenceKey(prisma, actor.ownerId, "budgetFormula", budgetFormula)
}

/**
 * Save a custom aggregated budget card.
 */
export async function saveCustomBudgetCard(
  card: { id: string, name: string, groupIds: string[], categoryIds: string[], amount: number }
) {
  // Mesmo ator das rotas de lançamento: as fórmulas são da CONTA (actor.ownerId), não da pessoa.
  const actor = await getWriteActor()
  if (!actor) throw new Error("User not found") // i18n-ignore: código de erro interno do service layer (rota traduz, service retorna código estável)

  const user = await prisma.user.findUnique({
    where: { id: actor.ownerId },
    select: { preferencesJson: true },
  })

  const preferences = (user?.preferencesJson as Record<string, any>) || {}
  const formula = preferences.budgetFormula || { global: { id: "simple_avg", params: {} }, perCard: {} }
  const customCards = formula.customCards || []

  const existingIndex = customCards.findIndex((c: any) => c.id === card.id)
  if (existingIndex >= 0) {
    customCards[existingIndex] = card
  } else {
    customCards.push(card)
  }

  formula.customCards = customCards

  await setUserPreferenceKey(prisma, actor.ownerId, "budgetFormula", formula)
}

/**
 * Delete a budget card (could be a db budget or a custom card)
 */
export async function deleteBudgetCard(id: string, isCustomCard: boolean) {
  // Mesmo ator das rotas de lançamento: as fórmulas são da CONTA (actor.ownerId), não da pessoa.
  const actor = await getWriteActor()
  if (!actor) throw new Error("User not found") // i18n-ignore: código de erro interno do service layer (rota traduz, service retorna código estável)

  if (isCustomCard) {
    const user = await prisma.user.findUnique({
      where: { id: actor.ownerId },
      select: { preferencesJson: true },
    })

    const preferences = (user?.preferencesJson as Record<string, any>) || {}
    const formula = preferences.budgetFormula || { global: { id: "simple_avg", params: {} }, perCard: {} }
    
    if (formula.customCards) {
      formula.customCards = formula.customCards.filter((c: any) => c.id !== id)
    }
    if (formula.perCard && formula.perCard[id]) {
      delete formula.perCard[id]
    }

    // Check if it's in order list
    if (preferences.budgetOrder) {
      preferences.budgetOrder = preferences.budgetOrder.filter((o: string) => o !== id)
    }

    await writeUserPreferenceKeys(prisma, actor.ownerId, [
      { key: "budgetFormula", value: formula },
      { key: "budgetOrder", value: preferences.budgetOrder ?? [] },
    ])
  } else {
    // We assume it's native. It could be grouped by categoryId or groupId 
    // Delete all budget rows for this owner matching either group or category
    await prisma.budget.deleteMany({
      where: {
        userId: actor.ownerId,
        OR: [
          { categoryId: id },
          { groupId: id }
        ]
      }
    })
  }
}

