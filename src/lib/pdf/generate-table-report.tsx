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
  const blob = await pdf(<TableReport {...props} />).toBlob()
  const url = URL.createObjectURL(blob)
  window.open(url, "_blank", "noopener")
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
