import { describe, expect, it } from "vitest"
import { canManageClosing, canManagePin, isDataOwner, type Actor } from "@/features/security/lib/permissions"

const base: Actor = { actorUserId: "u1", ownerId: "u1", role: "USER", status: "ACTIVE", showcase: false }

describe("predicados de fechamento", () => {
  it("dono USER da própria cópia (visitante da demo) fecha, reabre e define PIN", () => {
    expect(isDataOwner(base)).toBe(true)
    expect(canManageClosing(base)).toBe(true)
    expect(canManagePin(base)).toBe(true)
  })
  it("ADMIN convidado fecha e reabre, mas não define PIN", () => {
    const admin = { ...base, ownerId: "dono", role: "ADMIN" }
    expect(canManageClosing(admin)).toBe(true)
    expect(canManagePin(admin)).toBe(false)
  })
  it("USER convidado não faz nada", () => {
    const guest = { ...base, ownerId: "dono" }
    expect(canManageClosing(guest)).toBe(false)
    expect(canManagePin(guest)).toBe(false)
  })
  it("sessão de vitrine não faz nada mesmo sendo dona de si", () => {
    const showcase = { ...base, showcase: true }
    expect(canManageClosing(showcase)).toBe(false)
    expect(canManagePin(showcase)).toBe(false)
  })
  it("usuário PENDING não faz nada", () => {
    expect(canManageClosing({ ...base, status: "PENDING" })).toBe(false)
  })
})
