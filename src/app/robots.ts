import type { MetadataRoute } from "next"

/** Demo: páginas indexáveis (a vitrine é somente leitura — robô navegando não
 *  custa nada), /api fora do índice. Instalação pessoal: fora dos buscadores
 *  por inteiro. */
export default function robots(): MetadataRoute.Robots {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return { rules: [{ userAgent: "*", disallow: ["/api/"] }] }
  }
  return { rules: [{ userAgent: "*", disallow: ["/"] }] }
}
