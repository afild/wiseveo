"use server"

import { prisma } from "@/lib/prisma"
import { getWriteActor } from "@/features/security/services/write-context"
import { setUserPreferenceKey } from "@/features/settings/services/user-preferences-write"
import { revalidatePath } from "next/cache"

/**
 * Updates the budget cards order in the user's preferencesJson.
 * @param itemIds Array of item IDs in the new order.
 */
export async function updateBudgetOrder(itemIds: string[]) {
  try {
    // Dado da CONTA, não da pessoa: a ordem é LIDA pelo dono (get-budget-data), então
    // gravar na sessão faria o arrastar de quem entrou por convite não surtir efeito.
    // `actor.ownerId` é exatamente esse dono, o mesmo das rotas de lançamento.
    const actor = await getWriteActor()
    if (!actor) {
      return { success: false, error: "Unauthorized" }
    }

    // Update only the budgetOrder key
    await setUserPreferenceKey(prisma, actor.ownerId, "budgetOrder", itemIds)

    revalidatePath("/budget")
    return { success: true }
  } catch (error) {
    console.error("Failed to update budget order:", error)
    return { success: false, error: "Internal Server Error" } // i18n-ignore: código de erro interno do service layer (rota traduz, service retorna código estável)
  }
}
