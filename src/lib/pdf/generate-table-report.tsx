import { pdf } from "@react-pdf/renderer"

import { registerReportFonts } from "./report-fonts"
import { TableReport, type TableReportProps } from "./table-report"

/**
 * Fronteira do dynamic import: este módulo importa o react-pdf estaticamente,
 * e os data-tables importam ESTE módulo dinamicamente — assim o motor de PDF
 * fica fora do bundle inicial.
 */
export async function generateTableReport(props: TableReportProps): Promise<void> {
  registerReportFonts()
  // A aba tem de ser aberta DENTRO do gesto do usuário: gerar o PDF leva mais de um
  // segundo e, depois do await, o navegador trata window.open como popup e bloqueia
  // — o usuário clicaria em Imprimir e nada aconteceria.
  const tab = window.open("", "_blank")
  if (tab) tab.opener = null

  const blob = await pdf(<TableReport {...props} />).toBlob()
  const url = URL.createObjectURL(blob)

  if (tab) {
    tab.location.href = url
  } else {
    // Popup bloqueado mesmo assim: baixa o arquivo em vez de falhar em silêncio.
    const a = document.createElement("a")
    a.href = url
    a.download = `${props.title}.pdf`
    a.click()
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
