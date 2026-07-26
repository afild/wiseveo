import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

import type { ExportColumn, ExportRow } from "@/lib/table-export"

// O PDF é SEMPRE claro, independente do tema da UI — daí as cores fixas.
// `accent` é o --primary do tema claro em src/app/globals.css.
const COLORS = {
  accent: "#0F766E",
  border: "#E2E8F0",
  // headerBg tem de ser MAIS escuro que a zebra, senão o cabeçalho se dissolve
  // na primeira linha zebrada.
  headerBg: "#E8EDF3",
  muted: "#64748B",
  text: "#0F172A",
  zebra: "#F8FAFC",
}

/**
 * Peso relativo de largura por coluna. Sem isto todas as colunas dividem a página
 * igualmente e o número do lançamento ocupa tanto quanto a descrição — que então
 * quebra em 3-4 linhas enquanto sobra papel em branco à esquerda.
 */
const COLUMN_WEIGHTS: Record<string, number> = {
  account: 12,
  amount: 10,
  category: 12,
  date: 8,
  description: 22,
  group: 10,
  lastDate: 9,
  note: 18,
  num: 4,
  payee: 12,
  period: 7,
  reference: 10,
  status: 8,
  type: 7,
}
const DEFAULT_COLUMN_WEIGHT = 12

const styles = StyleSheet.create({
  page: {
    fontFamily: "Figtree",
    fontSize: 8.5,
    color: COLORS.text,
    paddingTop: 40,
    paddingHorizontal: 36,
    paddingBottom: 48,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  brand: {
    fontFamily: "Manrope",
    fontWeight: 700,
    fontSize: 11,
    letterSpacing: 2,
    color: COLORS.accent,
  },
  title: { fontFamily: "Manrope", fontWeight: 700, fontSize: 16, marginBottom: 2 },
  meta: { fontSize: 8, color: COLORS.muted, marginBottom: 2 },
  rule: {
    height: 2,
    backgroundColor: COLORS.accent,
    marginTop: 8,
    marginBottom: 12,
    width: 48,
  },
  headerRow: {
    flexDirection: "row",
    backgroundColor: COLORS.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  headerCell: {
    fontWeight: 600,
    fontSize: 8,
    paddingVertical: 5,
    paddingHorizontal: 4,
    // Antes: 8pt + muted + caixa alta + letter-spacing largo — cada uma aceitável
    // sozinha, as quatro juntas não. Cor do texto e spacing menor.
    color: COLORS.text,
    textTransform: "uppercase",
    letterSpacing: 0.2,
  },
  // Sem filete por linha: zebra E borda juntas viram textura a 8,5pt. A régua
  // forte fica só sob o cabeçalho.
  row: { flexDirection: "row" },
  rowZebra: { backgroundColor: COLORS.zebra },
  cell: { paddingVertical: 4.5, paddingHorizontal: 4 },
  numeric: { textAlign: "right" },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: COLORS.muted,
  },
})

export interface TableReportProps {
  brand: string
  title: string
  periodLine?: string
  generatedAtLine: string
  rowsCountLine: string
  /** Template já traduzido, ex.: "Página {page} de {total}". */
  pageOfTemplate: string
  columns: ExportColumn[]
  rows: ExportRow[]
  numericColumnIds: string[]
}

/** Componente puro: TODAS as strings chegam por props — quem traduz é o chamador. */
export function TableReport(props: TableReportProps) {
  const totalWeight = props.columns.reduce(
    (sum, c) => sum + (COLUMN_WEIGHTS[c.id] ?? DEFAULT_COLUMN_WEIGHT),
    0
  )
  const widthOf = (id: string) =>
    `${(((COLUMN_WEIGHTS[id] ?? DEFAULT_COLUMN_WEIGHT) / totalWeight) * 100).toFixed(3)}%`
  const cellStyle = (id: string) =>
    props.numericColumnIds.includes(id) ? [styles.cell, styles.numeric] : [styles.cell]

  return (
    <Document title={props.title}>
      <Page size="A4" style={styles.page}>
        <View style={styles.brandRow}>
          <Text style={styles.brand}>{props.brand}</Text>
          <Text style={styles.meta}>{props.generatedAtLine}</Text>
        </View>
        <Text style={styles.title}>{props.title}</Text>
        {props.periodLine ? <Text style={styles.meta}>{props.periodLine}</Text> : null}
        <Text style={styles.meta}>{props.rowsCountLine}</Text>
        <View style={styles.rule} />

        <View style={styles.headerRow} fixed>
          {props.columns.map((c) => (
            <Text
              key={c.id}
              style={[
                styles.headerCell,
                { width: widthOf(c.id) },
                ...(props.numericColumnIds.includes(c.id) ? [styles.numeric] : []),
              ]}
            >
              {c.label}
            </Text>
          ))}
        </View>
        {props.rows.map((row, i) => (
          <View key={i} style={i % 2 ? [styles.row, styles.rowZebra] : styles.row} wrap={false}>
            {props.columns.map((c) => (
              <Text key={c.id} style={[...cellStyle(c.id), { width: widthOf(c.id) }]}>
                {row[c.id] ?? ""}
              </Text>
            ))}
          </View>
        ))}

        <View style={styles.footer} fixed>
          <Text>{props.brand}</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              props.pageOfTemplate
                .replace("{page}", String(pageNumber))
                .replace("{total}", String(totalPages))
            }
          />
        </View>
      </Page>
    </Document>
  )
}
