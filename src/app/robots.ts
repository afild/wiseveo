import type { MetadataRoute } from "next"
import { LEGAL_ROUTES } from "@/lib/legal-routes"

/** Demo: páginas indexáveis (a vitrine é somente leitura — robô navegando não
 *  custa nada), /api fora do índice. Instalação pessoal: fora dos buscadores
 *  por inteiro, com UMA exceção — as páginas legais. O Google precisa alcançar a
 *  política de privacidade para publicar o app na tela de consentimento, e um
 *  `disallow: /` sem exceção atrapalha essa conferência. */
export default function robots(): MetadataRoute.Robots {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return { rules: [{ userAgent: "*", disallow: ["/api/"] }] }
  }
  return { rules: [{ userAgent: "*", allow: [...LEGAL_ROUTES], disallow: ["/"] }] }
}
