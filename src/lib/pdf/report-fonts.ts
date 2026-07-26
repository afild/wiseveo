import { Font } from "@react-pdf/renderer"

let registered = false

/**
 * Fontes da marca no PDF. Os arquivos são .woff (não .woff2) porque o fontkit
 * usado pelo @react-pdf/renderer não lê woff2.
 */
export function registerReportFonts() {
  if (registered) return
  registered = true
  Font.register({
    family: "Figtree",
    fonts: [
      { src: "/fonts/pdf/figtree-latin-400-normal.woff", fontWeight: 400 },
      { src: "/fonts/pdf/figtree-latin-600-normal.woff", fontWeight: 600 },
    ],
  })
  Font.register({
    family: "Manrope",
    fonts: [{ src: "/fonts/pdf/manrope-latin-700-normal.woff", fontWeight: 700 }],
  })
  // O react-pdf hifeniza por padrão com um algoritmo que não conhece português —
  // sem isto o relatório sai com "descri-ção" e coisas piores. Devolver a palavra
  // inteira desliga a hifenização.
  Font.registerHyphenationCallback((word) => [word])
}
