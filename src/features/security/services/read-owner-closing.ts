import type { PreferencesExecutor } from "@/features/settings/services/user-preferences-write"
import { resolveDateClosingPreferences, type DateClosingPreferences } from "../lib/date-closing"

type ClosingRow = Array<{ dc: unknown }>

/**
 * A linha do dono, com a trava pedida. Três templates literais (não um `${lock}` interpolado):
 * o texto da trava precisa estar no template para o banco travar de verdade e para os testes verem.
 * FOR SHARE em todo escritor; FOR UPDATE em fechar/reabrir; sem trava nas leituras.
 */
export async function readOwnerClosing(
  executor: PreferencesExecutor,
  ownerId: string,
  lock: "share" | "update" | null,
): Promise<DateClosingPreferences> {
  const rows =
    lock === "update"
      ? // i18n-ignore: SQL bruto, não é texto de UI
        await executor.$queryRaw<ClosingRow>`SELECT preferences_json::jsonb -> 'dateClosing' AS dc FROM users WHERE id = ${ownerId} FOR UPDATE`
      : lock === "share"
        ? // i18n-ignore: SQL bruto, não é texto de UI
          await executor.$queryRaw<ClosingRow>`SELECT preferences_json::jsonb -> 'dateClosing' AS dc FROM users WHERE id = ${ownerId} FOR SHARE`
        : // i18n-ignore: SQL bruto, não é texto de UI
          await executor.$queryRaw<ClosingRow>`SELECT preferences_json::jsonb -> 'dateClosing' AS dc FROM users WHERE id = ${ownerId} LIMIT 1`
  return resolveDateClosingPreferences(rows[0]?.dc)
}
