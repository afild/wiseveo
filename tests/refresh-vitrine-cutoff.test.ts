import { describe, expect, it } from "vitest"
import { planVitrineStatuses } from "@/features/demo/services/refresh-vitrine-cutoff.service"

const tx = (id: string, date: string, amount: number, type: "INCOME" | "EXPENSE") => ({
  id, date: new Date(date), amount, type,
})

describe("planVitrineStatuses", () => {
  const now = new Date("2026-09-10T15:00:00Z") // corte = fim de 2026-09-09 UTC

  it("paga até ontem, pendente depois, e escolhe as 2 menores despesas recentes como vencidas", () => {
    const plan = planVitrineStatuses(
      [
        tx("velha", "2026-09-01T12:00:00Z", -500, "EXPENSE"),
        tx("ontem-pequena", "2026-09-08T12:00:00Z", -50, "EXPENSE"),
        tx("ontem-media", "2026-09-07T12:00:00Z", -120, "EXPENSE"),
        tx("ontem-grande", "2026-09-06T12:00:00Z", -400, "EXPENSE"),
        tx("receita", "2026-09-08T12:00:00Z", 1000, "INCOME"),
        tx("futura", "2026-09-20T12:00:00Z", -80, "EXPENSE"),
      ],
      now,
    )
    expect(plan.overdueIds.sort()).toEqual(["ontem-media", "ontem-pequena"])
    expect(plan.paidIds).toContain("velha")
    expect(plan.paidIds).toContain("ontem-grande")
    expect(plan.paidIds).toContain("receita")
    expect(plan.pendingIds).toEqual(["futura"])
  })

  it("sem candidatas a vencida, tudo até o corte é pago", () => {
    const plan = planVitrineStatuses(
      [tx("a", "2026-09-01T12:00:00Z", -500, "EXPENSE"), tx("b", "2026-09-12T12:00:00Z", -50, "EXPENSE")],
      now,
    )
    expect(plan.overdueIds).toEqual([])
    expect(plan.paidIds).toEqual(["a"])
    expect(plan.pendingIds).toEqual(["b"])
  })
})
