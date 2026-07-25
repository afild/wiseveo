import { describe, it, expect } from "vitest"
import { dedupCustomCardMembers } from "@/features/budget/lib/custom-card-members"

const groups = [
  { id: "g1", categories: [{ id: "c1" }, { id: "c2" }] },
  { id: "g2", categories: [{ id: "c3" }] },
]

describe("dedupCustomCardMembers", () => {
  it("remove categorias cujo grupo já está no card", () => {
    const r = dedupCustomCardMembers({ groupIds: ["g1"], categoryIds: ["c1", "c3"] }, groups)
    expect(r).toEqual({ groupIds: ["g1"], categoryIds: ["c3"] })
  })
  it("sem sobreposição, devolve igual", () => {
    const r = dedupCustomCardMembers({ groupIds: ["g2"], categoryIds: ["c1"] }, groups)
    expect(r).toEqual({ groupIds: ["g2"], categoryIds: ["c1"] })
  })
})
