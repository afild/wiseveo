import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

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
  closing: { closedThrough: null as string | null, pinHash: null as string | null },
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

/**
 * O relógio do servidor fica LONGE do dia de quem recebe, e de propósito: o
 * recorte tem de sair de `parts`. Com o relógio solto, a data do dublê batia com
 * o dia UTC de hoje por acaso, e trocar `localDateKey(parts)` pelo dia do
 * servidor passaria por estes testes sem ninguém ver.
 */
const SERVER_NOW = new Date("2026-12-25T13:00:00.000Z")

const owner: Actor = {
  actorUserId: "dono",
  ownerId: "dono",
  role: "SUPERADMIN",
  status: "ACTIVE",
  showcase: false,
}
const guest: Actor = { ...owner, actorUserId: "convidado", role: "USER" }
/** Convidado que FECHA datas mas não cria PIN: a chave da casa é do dono. */
const invitedAdmin: Actor = { ...owner, actorUserId: "convidado", role: "ADMIN" }

beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(SERVER_NOW)
})

afterAll(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  m.closing = { closedThrough: "2026-09-01", pinHash: "$2a$10$hash" }
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
    expect(text).not.toContain("openDates.noPin")
  })

  it("conta a partir do corte, até o dia do prazo", async () => {
    m.between = { total: 1, unpaid: 0, firstDate: "2026-08-20", lastDate: "2026-08-20" }

    await buildOpenDatesReminder({ actor: owner, parts, days: 7, ctx })

    // (corte, hoje - 7]: 03/09 menos sete dias é 27/08.
    expect(m.betweenArgs).toEqual(["dono", "2026-09-01", "2026-08-27"])
  })

  it("o dia é o de quem recebe, não o do servidor", async () => {
    // Relógio do servidor parado em 25/12/2026 (UTC); quem recebe está num fuso
    // onde já é dia 26. O prazo tem de sair do calendário DELA — usar o dia do
    // servidor aqui erraria o recorte por um dia inteiro.
    const ahead: ZonedParts = { ...parts, year: 2026, month: 12, day: 26, weekday: 6 }

    await buildOpenDatesReminder({ actor: owner, parts: ahead, days: 7, ctx })

    expect(m.betweenArgs).toEqual(["dono", "2026-09-01", "2026-12-19"])
  })

  it("dispara por corte parado além do prazo, mesmo sem lançamento nenhum", async () => {
    m.closing = { closedThrough: "2026-08-10", pinHash: "$2a$10$hash" }

    const text = await buildOpenDatesReminder({ actor: owner, parts, days: 7, ctx })

    expect(text).toContain("openDates.stale")
    expect(text).toContain("10/08/2026")
    expect(text).not.toContain("openDates.pending")
  })

  it("cala quando não há nada aberto e o corte está em dia", async () => {
    expect(await buildOpenDatesReminder({ actor: owner, parts, days: 7, ctx })).toBeNull()
  })

  it("cala na borda: corte exatamente no dia do prazo ainda não está parado", async () => {
    m.closing = { closedThrough: "2026-08-27", pinHash: "$2a$10$hash" }
    expect(await buildOpenDatesReminder({ actor: owner, parts, days: 7, ctx })).toBeNull()

    m.closing = { closedThrough: "2026-08-26", pinHash: "$2a$10$hash" }
    expect(await buildOpenDatesReminder({ actor: owner, parts, days: 7, ctx })).toContain(
      "openDates.stale",
    )
  })

  it("cala na instalação que nunca fechou nada e não tem lançamento antigo", async () => {
    m.closing = { closedThrough: null, pinHash: "$2a$10$hash" }
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
    m.closing = { closedThrough: "2026-08-20", pinHash: "$2a$10$hash" }
    m.between = { total: 0, unpaid: 0, firstDate: null, lastDate: null }

    // Com 60 dias de prazo, um corte de 14 dias atrás ainda está em dia.
    expect(await buildOpenDatesReminder({ actor: owner, parts, days: 60, ctx })).toBeNull()
    expect(m.betweenArgs).toEqual(["dono", "2026-08-20", "2026-07-05"])

    // Com 1 dia, o mesmo corte já está parado.
    expect(await buildOpenDatesReminder({ actor: owner, parts, days: 1, ctx })).toContain(
      "openDates.stale",
    )
  })

  describe("tudo num dia só", () => {
    it("um dia só vira 'em {date}', não 'entre a mesma data e ela mesma'", async () => {
      m.between = { total: 4, unpaid: 0, firstDate: "2026-08-20", lastDate: "2026-08-20" }

      const text = await buildOpenDatesReminder({ actor: owner, parts, days: 7, ctx })

      expect(text).toContain('openDates.pendingSameDay:{"count":4,"date":"20/08/2026"}')
      expect(text).not.toContain("openDates.pending:")
    })

    it("dias diferentes continuam com o intervalo", async () => {
      m.between = { total: 4, unpaid: 0, firstDate: "2026-08-20", lastDate: "2026-08-21" }

      const text = await buildOpenDatesReminder({ actor: owner, parts, days: 7, ctx })

      expect(text).toContain("openDates.pending:")
      expect(text).not.toContain("openDates.pendingSameDay")
    })
  })

  describe("sem PIN gravado", () => {
    it("o dono é avisado de que precisa criar o PIN antes", async () => {
      m.closing = { closedThrough: "2026-08-10", pinHash: null }

      const text = await buildOpenDatesReminder({ actor: owner, parts, days: 7, ctx })

      expect(text).toContain("openDates.stale")
      // A frase do PIN vem por último: o motivo do aviso é a linha de cima.
      expect(text?.endsWith("openDates.noPin")).toBe(true)
    })

    it("convidado ADMIN não é cobrado por uma tecla que não é dele", async () => {
      m.closing = { closedThrough: "2026-08-10", pinHash: null }
      m.between = { total: 9, unpaid: 4, firstDate: "2026-08-20", lastDate: "2026-08-25" }

      expect(await buildOpenDatesReminder({ actor: invitedAdmin, parts, days: 7, ctx })).toBeNull()
      // Cala antes até de contar lançamento: nada a dizer, nada a consultar.
      expect(m.betweenArgs).toEqual([])
    })

    it("com PIN gravado, o convidado ADMIN recebe normalmente", async () => {
      m.closing = { closedThrough: "2026-08-10", pinHash: "$2a$10$hash" }

      const text = await buildOpenDatesReminder({ actor: invitedAdmin, parts, days: 7, ctx })

      expect(text).toContain("openDates.stale")
      expect(text).not.toContain("openDates.noPin")
    })

    it("sem PIN e sem nada aberto continua calado", async () => {
      m.closing = { closedThrough: "2026-09-01", pinHash: null }
      expect(await buildOpenDatesReminder({ actor: owner, parts, days: 7, ctx })).toBeNull()
    })
  })
})
