/**
 * Conferência do dump ANTES de enviar. Referência de 04/09/2026 no banco do dono:
 * 196 objetos no índice e 271.679 bytes. Arquivo que não passa aqui não sobe, e a cópia
 * boa anterior no Drive não é apagada.
 */
export const MIN_TOC_OBJECTS = 150
export const MIN_DUMP_BYTES = 100_000

export type DumpCheck = { ok: true; objects: number } | { ok: false; reason: "tooFewObjects" | "noTransactions" | "tooSmall" }

export function checkDumpToc(toc: string, sizeBytes: number): DumpCheck {
  const entries = toc.split("\n").filter((line) => /^\d+;/.test(line))
  if (entries.length < MIN_TOC_OBJECTS) return { ok: false, reason: "tooFewObjects" }
  // i18n-ignore: rótulo do índice do pg_restore, dado do arquivo e não texto de tela
  if (!entries.some((line) => line.includes("TABLE DATA public transactions"))) return { ok: false, reason: "noTransactions" }
  if (sizeBytes < MIN_DUMP_BYTES) return { ok: false, reason: "tooSmall" }
  return { ok: true, objects: entries.length }
}
