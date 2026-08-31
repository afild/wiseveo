import { DEMO_SHARED_MARKER_COOKIE } from "@/lib/demo-shared"

/**
 * O cliente só PINTA estado; quem manda é a claim no token (servidor).
 * Parsing no padrão de client-session-reset.ts: separador e espaços do
 * document.cookie não são garantidos, então trim + startsWith, nunca igualdade
 * do par inteiro.
 */
export function hasSharedDemoMarker(): boolean {
  if (typeof document === "undefined") return false
  return document.cookie
    .split(";")
    .some((c) => c.trim().startsWith(`${DEMO_SHARED_MARKER_COOKIE}=1`))
}
