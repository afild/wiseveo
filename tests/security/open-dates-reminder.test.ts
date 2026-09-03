import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * O aviso de "datas abertas": o lembrete que chega no Telegram quando alguém
 * passou dias sem fechar nada. Dois gatilhos, e um só basta — lançamento
 * esperando fechamento, ou o próprio corte parado há mais tempo que o prazo.
 *
 * Nenhum banco é tocado: a leitura do fechamento e a contagem de lançamentos
 * são substituídas por dublês, porque o que está sendo guardado aqui é a REGRA
 * (quem recebe, quando cala, o que a frase diz), não a consulta.
 */

const m = vi.hoisted(() => ({
  closing: { closedThrough: null as string | null },
  between: {
    total: 0,
    unpaid: 0,
    firstDate: null as string | null,
    lastDate: null as string | null,
  },
  betweenArgs: [] as unknown[],
}))

vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/features/security/services/read-owner-closing", () => ({
  readOwnerClosing: async () => m.closing,
}))
vi.mock("@/features/security/services/date-closing.service", () => ({
  countTransactionsBetween: async (...args: unknown[]) => {
    m.betweenArgs = args
    return m.between
  },
}))

import { buildOpenDatesReminder } from "@/features/security/services/open-dates-reminder.service"
import type { Actor } from "@/features/security/lib/permissions"
import type { ZonedParts } from "@/features/notifications/lib/schedule"
import type { NotificationContext } from "@/features/notifications/types/notifications.types"

// Tradutor de mentira: devolve a chave e os valores, o suficiente para conferir
// O QUE foi dito sem depender do texto de nenhum idioma.
const ctx = {
  locale: "pt-BR",
  t: ((key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key) as unknown,
  monetary: { formatNumberValue: (value: number) => value.toFixed(2) },
} as unknown as NotificationContext

/** 03/09/2026, oito da manhã no relógio de quem recebe. */
const parts: ZonedParts = {
  year: 2026,
  month: 9,
  day: 3,
  hour: 8,
  minute: 0,
  weekday: 4,
  minutesOfDay: 480,
}

const owner: Actor = {
  actorUserId: "dono",
  ownerId: "dono",
  role: "SUPERADMIN",
  status: "ACTIVE",
  showcase: false,
}
const guest: Actor = { ...owner, actorUserId: "convidado", role: "USER" }

beforeEach(() => {
  m.closing = { closedThrough: "2026-09-01" }
  m.between = { total: 0, unpaid: 0, firstDate: null, lastDate: null }
  m.betweenArgs = []
})

describe("buildOpenDatesReminder", () => {
  it("dispara por lançamento aberto além do prazo", async () => {
    m.between = { total: 3, unpaid: 0, firstDate: "2026-08-20", lastDate: "2026-08-25" }

    const text = await buildOpenDatesReminder({ actor: owner, parts, days: 7, ctx })

    expect(text).toContain("openDates.pending")
    expect(text).toContain('"count":3')
    expect(text).toContain("20/08/2026")
    expect(text).toContain("25/08/2026")
    expect(text).not.toContain("openDates.stale")
    expect(text).not.toContain("openDates.unpaid")
  })

  it("conta a partir do corte, até o dia do prazo", async () => {
    m.between = { total: 1, unpaid: 0, firstDate: "2026-08-20", lastDate: "2026-08-20" }

    await buildOpenDatesReminder({ actor: owner, parts, days: 7, ctx })

    // (corte, hoje - 7]: 03/09 menos sete dias é 27/08.
    expect(m.betweenArgs).toEqual(["dono", "2026-09-01", "2026-08-27"])
  })

  it("dispara por corte parado além do prazo, mesmo sem lançamento nenhum", async () => {
    m.closing = { closedThrough: "2026-08-10" }

    const text = await buildOpenDatesReminder({ actor: owner, parts, days: 7, ctx })

    expect(text).toContain("openDates.stale")
    expect(text).toContain("10/08/2026")
    expect(text).not.toContain("openDates.pending")
  })

  it("cala quando não há nada aberto e o corte está em dia", async () => {
    expect(await buildOpenDatesReminder({ actor: owner, parts, days: 7, ctx })).toBeNull()
  })

  it("cala na borda: corte exatamente no dia do prazo ainda não está parado", async () => {
    m.closing = { closedThrough: "2026-08-27" }
    expect(await buildOpenDatesReminder({ actor: owner, parts, days: 7, ctx })).toBeNull()

    m.closing = { closedThrough: "2026-08-26" }
    expect(await buildOpenDatesReminder({ actor: owner, parts, days: 7, ctx })).toContain(
      "openDates.stale",
    )
  })

  it("cala na instalação que nunca fechou nada e não tem lançamento antigo", async () => {
    m.closing = { closedThrough: null }
    expect(await buildOpenDatesReminder({ actor: owner, parts, days: 7, ctx })).toBeNull()
  })

  it("USER convidado não recebe, nem quando há o que fechar", async () => {
    m.between = { total: 9, unpaid: 4, firstDate: "2026-08-20", lastDate: "2026-08-25" }
    expect(await buildOpenDatesReminder({ actor: guest, parts, days: 7, ctx })).toBeNull()
    // Nem chegou a ler o fechamento de outra pessoa.
    expect(m.betweenArgs).toEqual([])
  })

  it("sessão de vitrine não recebe", async () => {
    m.between = { total: 9, unpaid: 0, firstDate: "2026-08-20", lastDate: "2026-08-25" }
    expect(
      await buildOpenDatesReminder({ actor: { ...owner, showcase: true }, parts, days: 7, ctx }),
    ).toBeNull()
  })

  it("acrescenta a frase de não pagos quando algum está em aberto", async () => {
    m.between = { total: 6, unpaid: 2, firstDate: "2026-08-20", lastDate: "2026-08-25" }

    const text = await buildOpenDatesReminder({ actor: owner, parts, days: 7, ctx })

    expect(text).toContain("openDates.pending")
    expect(text).toContain('openDates.unpaid:{"unpaid":2}')
  })

  it("o prazo escolhido manda no recorte", async () => {
    m.closing = { closedThrough: "2026-08-20" }
    m.between = { total: 0, unpaid: 0, firstDate: null, lastDate: null }

    // Com 60 dias de prazo, um corte de 14 dias atrás ainda está em dia.
    expect(await buildOpenDatesReminder({ actor: owner, parts, days: 60, ctx })).toBeNull()
    expect(m.betweenArgs).toEqual(["dono", "2026-08-20", "2026-07-05"])

    // Com 1 dia, o mesmo corte já está parado.
    expect(await buildOpenDatesReminder({ actor: owner, parts, days: 1, ctx })).toContain(
      "openDates.stale",
    )
  })
})
