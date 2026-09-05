import { getZonedParts, localDateKey } from "@/features/notifications/lib/schedule"
import type { BackupPreferences } from "./backup-preferences"

/**
 * "Está na hora?" em função de `now` e do fuso do dono. Sem relógio escondido, sem
 * banco: por isso é testável de ponta a ponta.
 *
 * Pelo despertador: roda em qualquer batida do dia local a partir do horário escolhido;
 * quem garante "uma vez só" é a reserva em notification_deliveries com a chave do dia.
 * À mão: roda sempre (menos sem Drive), com chave própria, para não consumir a do dia.
 */
export type BackupTrigger = "tick" | "manual"

export type BackupDecision =
  | { run: true; occurrenceKey: string }
  | { run: false; reason: "disabled" | "driveNotConnected" | "notYet" }

export interface BackupDecisionInput {
  now: Date
  timezone: string
  preferences: BackupPreferences
  trigger: BackupTrigger
}

/** Só para o sufixo HHMM da chave manual; o dia sai de `localDateKey`. */
const pad = (value: number) => String(value).padStart(2, "0")

export function decideBackup(input: BackupDecisionInput): BackupDecision {
  const { preferences, trigger } = input
  if (!preferences.driveGrantedAt) return { run: false, reason: "driveNotConnected" }
  const parts = getZonedParts(input.now, input.timezone)
  const day = localDateKey(parts)
  if (trigger === "manual") {
    return { run: true, occurrenceKey: `${day}-manual-${pad(parts.hour)}${pad(parts.minute)}` }
  }
  if (!preferences.enabled) return { run: false, reason: "disabled" }
  const due = preferences.hour * 60 + preferences.minute
  if (parts.minutesOfDay < due) return { run: false, reason: "notYet" }
  return { run: true, occurrenceKey: day }
}
