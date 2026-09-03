type SqlLike = { strings?: readonly string[]; values?: unknown[]; text?: string }
export function renderValue(value: unknown): string {
  if (value && typeof value === "object") {
    const v = value as SqlLike
    if (Array.isArray(v.strings)) return v.strings.reduce((acc, s, i) => acc + s + (i < (v.values?.length ?? 0) ? renderValue(v.values![i]) : ""), "")
    if (typeof v.text === "string") return v.text
  }
  return typeof value === "string" ? value : JSON.stringify(value)
}
/** Texto completo do template com os valores no lugar dos `${}` (só para asserções). */
export function sqlText(strings: TemplateStringsArray, values: unknown[]): string {
  return strings.reduce((acc, s, i) => acc + s + (i < values.length ? renderValue(values[i]) : ""), "")
}
