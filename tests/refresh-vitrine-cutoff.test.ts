import { describe, expect, it } from "vitest"
import { planVitrineStatuses } from "@/features/demo/services/refresh-vitrine-cutoff.service"

const tx = (id: string, date: string, amount: number, type: "INCOME" | "EXPENSE") => ({
  id, date: new Date(date), amount, type,
})

// Fronteiras inclusivas: trocar qualquer <= por < (ou 300/5 dias por um a menos)
// derruba o teste de fronteiras abaixo.

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

  it("fronteiras inclusivas: corte exato, teto 300 e janela de 5 dias", () => {
    const plan = planVitrineStatuses(
      [
        tx("no-corte", "2026-09-09T23:59:59.999Z", -300, "EXPENSE"), // NO instante do corte E |valor| = 300 → vencida
        tx("apos-corte", "2026-09-10T00:00:00.000Z", -5, "EXPENSE"), // 1ms depois do corte → pendente
        tx("janela-5d", "2026-09-04T23:59:59.999Z", -200, "EXPENSE"), // exatamente 5 dias antes → vencida
        tx("fora-janela", "2026-09-04T23:59:59.998Z", -1, "EXPENSE"), // 1ms além da janela (a menor!) → paga
        tx("acima-300", "2026-09-08T12:00:00Z", -300.01, "EXPENSE"), // acima do teto → paga
      ],
      now,
    )
    expect(plan.overdueIds.sort()).toEqual(["janela-5d", "no-corte"])
    expect(plan.pendingIds).toEqual(["apos-corte"])
    expect(plan.paidIds.sort()).toEqual(["acima-300", "fora-janela"])
  })
})
