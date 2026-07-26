import { describe, it, expect } from "vitest"
import { getZoneKey } from "@/features/budget/lib/zones"

describe("getZoneKey", () => {
  it("fronteiras: ≤50 safe, ≤80 warning, >80 danger", () => {
    expect(getZoneKey(0)).toBe("safe")
    expect(getZoneKey(50)).toBe("safe")
    expect(getZoneKey(50.1)).toBe("warning")
    expect(getZoneKey(80)).toBe("warning")
    expect(getZoneKey(80.1)).toBe("danger")
  })
})
