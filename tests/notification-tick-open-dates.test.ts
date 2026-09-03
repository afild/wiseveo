import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * O pedaço do tique que monta o aviso de datas abertas.
 *
 * O tique inteiro fala com banco, IA e Telegram; o que muda de verdade neste
 * ponto é UMA decisão: qual ator vai ao serviço do aviso. É ela que amarra o
 * "quem pode fechar" do despertador à mesma regra das telas — e é ela que este
 * arquivo guarda. O serviço do aviso é dublado; o que se confere é o que o tique
 * lhe entrega e o que devolve para a fila.
 */

const m = vi.hoisted(() => ({
  reminder: vi.fn<(input: unknown) => Promise<string | null>>(),
}))

vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/features/security/services/open-dates-reminder.service", () => ({
  buildOpenDatesReminder: m.reminder,
}))

import { buildOpenDatesJob, type QueuedJob } from "@/features/notifications/services/run-tick.service"
import { defaultNotificationPreferences } from "@/features/notifications/lib/preferences"
import type { ZonedParts } from "@/features/notifications/lib/schedule"
import type { NotificationContext } from "@/features/notifications/types/notifications.types"

const ctx = { locale: "pt-BR", t: (key: string) => key } as unknown as NotificationContext

/** 03/09/2026, nove da manhã no relógio de quem recebe. */
const parts: ZonedParts = {
  year: 2026,
  month: 9,
  day: 3,
  hour: 9,
  minute: 0,
  weekday: 4,
  minutesOfDay: 540,
}

const job: QueuedJob = {
  userId: "convidado",
  chatId: "12345",
  kind: "openDatesReminder",
  occurrenceKey: "2026-09-03",
  preferences: {
    ...defaultNotificationPreferences,
    timezone: "America/New_York",
    openDatesReminder: { enabled: true, time: "09:00", days: 10 },
  },
  parts,
  rawPreferences: { locale: "pt-BR" },
  audience: "Alice",
  role: "ADMIN",
  status: "ACTIVE",
}

beforeEach(() => {
  m.reminder.mockReset()
  m.reminder.mockResolvedValue(null)
})

describe("buildOpenDatesJob", () => {
  it("aviso calado vira silêncio na fila, sem texto nenhum", async () => {
    m.reminder.mockResolvedValue(null)

    expect(await buildOpenDatesJob(job, "dono", ctx)).toEqual({ send: "nothing", reason: "quiet" })
  })

  it("aviso com texto sai como mensagem de texto, palavra por palavra", async () => {
    m.reminder.mockResolvedValue("Você tem 3 lançamentos ainda não fechados.")

    expect(await buildOpenDatesJob(job, "dono", ctx)).toEqual({
      send: "text",
      text: "Você tem 3 lançamentos ainda não fechados.",
    })
  })

  it("o ator leva o dono resolvido e nunca é vitrine", async () => {
    await buildOpenDatesJob(job, "dono", ctx)

    expect(m.reminder).toHaveBeenCalledTimes(1)
    const input = m.reminder.mock.calls[0]![0] as {
      actor: Record<string, unknown>
      parts: ZonedParts
      days: number
      ctx: NotificationContext
    }
    expect(input.actor).toEqual({
      // Quem recebe é o convidado; a conta é do dono. Trocar um pelo outro faria
      // o convidado ADMIN parecer o dono dos dados e ganhar poder que não tem.
      actorUserId: "convidado",
      ownerId: "dono",
      role: "ADMIN",
      status: "ACTIVE",
      // Despertador não é sessão de vitrine, nunca.
      showcase: false,
    })
    expect(input.parts).toBe(parts)
    // O prazo é o que a pessoa escolheu na tela, não o padrão.
    expect(input.days).toBe(10)
    expect(input.ctx).toBe(ctx)
  })

  it("papel e situação vêm da linha de quem recebe, não de um valor fixo", async () => {
    await buildOpenDatesJob({ ...job, role: "USER", status: "PENDING" }, "dono", ctx)

    expect(m.reminder.mock.calls[0]![0]).toMatchObject({
      actor: { role: "USER", status: "PENDING" },
    })
  })
})
