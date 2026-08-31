import { DEMO_SHARED_MARKER_COOKIE } from "@/lib/demo-shared"

/**
 * Parser puro (sem DOM — testável direto): separador e espaços do
 * document.cookie não são garantidos, daí o trim antes de comparar. Igualdade
 * EXATA do par `nome=valor`, não startsWith: `${MARKER}=10` bate como prefixo
 * de `${MARKER}=1` e daria falso positivo.
 */
export function hasSharedDemoMarkerIn(cookieString: string): boolean {
  return cookieString
    .split(";")
    .some((c) => c.trim() === `${DEMO_SHARED_MARKER_COOKIE}=1`)
}

/**
 * O cliente só PINTA estado; quem manda é a claim no token (servidor).
 */
export function hasSharedDemoMarker(): boolean {
  if (typeof document === "undefined") return false
  return hasSharedDemoMarkerIn(document.cookie)
}
