import { describe, expect, it } from "vitest"
import { hasSharedDemoMarkerIn } from "@/lib/demo-shared-client"

// Parser puro: cobre a variação de espaço/posição que document.cookie não
// garante, e o falso positivo de prefixo (M7) que o startsWith antigo deixava
// passar.
describe("hasSharedDemoMarkerIn", () => {
  it("aceita o marcador com espaço à esquerda", () => {
    expect(hasSharedDemoMarkerIn(" wiseveo-demo-shared=1")).toBe(true)
  })

  it("aceita o marcador em qualquer posição da lista", () => {
    expect(hasSharedDemoMarkerIn("wiseveo-demo-shared=1")).toBe(true)
    expect(hasSharedDemoMarkerIn("a=b; wiseveo-demo-shared=1; c=d")).toBe(true)
    expect(hasSharedDemoMarkerIn("a=b; c=d; wiseveo-demo-shared=1")).toBe(true)
  })

  it("recusa valor vazio (estado pós-fork: cookie zerado, não removido)", () => {
    expect(hasSharedDemoMarkerIn("wiseveo-demo-shared=")).toBe(false)
  })

  it("recusa cookie de nome parecido", () => {
    expect(hasSharedDemoMarkerIn("xwiseveo-demo-shared=1")).toBe(false)
  })

  it("recusa falso positivo de prefixo: =10 não é =1", () => {
    expect(hasSharedDemoMarkerIn("wiseveo-demo-shared=10")).toBe(false)
  })

  it("recusa cookie ausente", () => {
    expect(hasSharedDemoMarkerIn("")).toBe(false)
    expect(hasSharedDemoMarkerIn("a=b; c=d")).toBe(false)
  })
})
