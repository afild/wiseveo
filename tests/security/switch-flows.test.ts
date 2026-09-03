import { describe, expect, it } from "vitest"

import { computeSwitchState } from "@/features/security/lib/date-closing"
import {
  decideCloseResponse,
  decideReopenResponse,
  decideSwitchToggle,
  localDateOfDayKey,
  readUnpaidBlockers,
  reopenDialogMode,
  resolveSwitchView,
  retainConfirmThroughForDisplay,
  type ClosingPermissions,
} from "@/features/security/lib/switch-flows"

const TODAY = "2026-09-03"

/** Permissões do dono com PIN definido: o caminho feliz de onde as variações partem. */
const owner: ClosingPermissions = { hasPin: true, canManageClosing: true, canManagePin: true }
const perms = (patch: Partial<ClosingPermissions>): ClosingPermissions => ({ ...owner, ...patch })

/** Os estados da tabela da seção 7, montados pela função que já existe (nada de literal solto). */
const stateOf = (from: string, to: string, closedThrough: string | null) =>
  computeSwitchState({ from, to, today: TODAY, closedThrough })

const openMonth = stateOf("2026-09-01", "2026-09-30", null)
const closedMonth = stateOf("2026-08-01", "2026-08-31", "2026-08-31")
const mixedMonth = stateOf("2026-08-15", "2026-09-30", "2026-08-31")
const futureMonth = stateOf("2026-10-01", "2026-10-31", null)

describe("estados de partida", () => {
  it("a tabela da seção 7 entrega os alvos que os fluxos consomem", () => {
    expect(openMonth).toMatchObject({ checked: false, disabled: false, label: "open", closeTarget: TODAY, reopenFrom: null })
    expect(closedMonth).toMatchObject({ checked: true, disabled: false, label: "closed", closeTarget: null, reopenFrom: "2026-08-01" })
    expect(mixedMonth).toMatchObject({ checked: false, disabled: false, label: "closedThrough", closeTarget: TODAY, reopenFrom: null })
    expect(futureMonth).toMatchObject({ checked: false, disabled: true, label: "nothingToClose", closeTarget: null, reopenFrom: null })
  })
})

/**
 * Ligar o switch. O que importa é QUAL janela abre: a de criar o PIN antes de fechar, a
 * confirmação de fechar, ou nenhuma.
 */
describe("ligar o switch", () => {
  it("com PIN definido vai direto para a confirmação, no dia que o estado calculou", () => {
    expect(decideSwitchToggle({ state: openMonth, next: true, permissions: owner })).toEqual({
      kind: "confirmClose",
      through: TODAY,
    })
    expect(decideSwitchToggle({ state: mixedMonth, next: true, permissions: owner })).toEqual({
      kind: "confirmClose",
      through: TODAY,
    })
  })

  it("sem PIN, quem pode criar passa primeiro pela criação do PIN", () => {
    expect(decideSwitchToggle({ state: openMonth, next: true, permissions: perms({ hasPin: false }) })).toEqual({
      kind: "createPinThenClose",
      through: TODAY,
    })
  })

  it("sem PIN e sem poder criar (ADMIN convidado) não abre nada", () => {
    const admin = perms({ hasPin: false, canManagePin: false })
    expect(decideSwitchToggle({ state: openMonth, next: true, permissions: admin })).toEqual({ kind: "none" })
  })

  it("não abre nada sem permissão de fechar, com o período já fechado, no futuro ou antes do estado chegar", () => {
    expect(decideSwitchToggle({ state: openMonth, next: true, permissions: perms({ canManageClosing: false }) })).toEqual({ kind: "none" })
    expect(decideSwitchToggle({ state: closedMonth, next: true, permissions: owner })).toEqual({ kind: "none" })
    expect(decideSwitchToggle({ state: futureMonth, next: true, permissions: owner })).toEqual({ kind: "none" })
    expect(decideSwitchToggle({ state: null, next: true, permissions: owner })).toEqual({ kind: "none" })
  })
})

/** Desligar o switch: sempre o diálogo de reabertura, que é quem cuida do PIN por dentro. */
describe("desligar o switch", () => {
  it("abre a reabertura a partir do início do período em tela", () => {
    expect(decideSwitchToggle({ state: closedMonth, next: false, permissions: owner })).toEqual({
      kind: "reopen",
      from: "2026-08-01",
    })
  })

  it("sem PIN, quem pode criar ainda abre a reabertura (o diálogo cria o PIN antes)", () => {
    expect(decideSwitchToggle({ state: closedMonth, next: false, permissions: perms({ hasPin: false }) })).toEqual({
      kind: "reopen",
      from: "2026-08-01",
    })
  })

  it("sem PIN e sem poder criar, ou sem permissão de fechar, não abre nada", () => {
    expect(decideSwitchToggle({ state: closedMonth, next: false, permissions: perms({ hasPin: false, canManagePin: false }) })).toEqual({ kind: "none" })
    expect(decideSwitchToggle({ state: closedMonth, next: false, permissions: perms({ canManageClosing: false }) })).toEqual({ kind: "none" })
  })

  it("não abre nada quando o período em tela não está fechado", () => {
    expect(decideSwitchToggle({ state: openMonth, next: false, permissions: owner })).toEqual({ kind: "none" })
    expect(decideSwitchToggle({ state: null, next: false, permissions: owner })).toEqual({ kind: "none" })
  })
})

/** Aparência: o que o switch mostra e quando ele fica cinza. */
describe("aparência do switch", () => {
  it("antes do provider responder fica desabilitado e sem rótulo (nunca um estado chutado)", () => {
    expect(resolveSwitchView({ state: null, closedThrough: null, permissions: owner })).toEqual({
      checked: false,
      disabled: true,
      label: null,
      labelDate: null,
      note: null,
    })
  })

  it("repassa marca, rótulo e a data do corte do estado calculado", () => {
    expect(resolveSwitchView({ state: closedMonth, closedThrough: "2026-08-31", permissions: owner })).toEqual({
      checked: true,
      disabled: false,
      label: "closed",
      labelDate: "2026-08-31",
      note: null,
    })
    expect(resolveSwitchView({ state: mixedMonth, closedThrough: "2026-08-31", permissions: owner })).toMatchObject({
      label: "closedThrough",
      labelDate: "2026-08-31",
    })
  })

  it("quem não pode fechar (USER convidado, vitrine) vê o rótulo, mas o switch fica cinza", () => {
    expect(resolveSwitchView({ state: openMonth, closedThrough: null, permissions: perms({ canManageClosing: false }) })).toMatchObject({
      disabled: true,
      label: "open",
      note: null,
    })
  })

  it("sem PIN e sem poder criar, fica cinza com o recado de pedir ao dono", () => {
    expect(resolveSwitchView({ state: openMonth, closedThrough: null, permissions: perms({ hasPin: false, canManagePin: false }) })).toMatchObject({
      disabled: true,
      label: "open",
      note: "askOwnerPin",
    })
  })

  it("sem PIN, mas podendo criar, continua clicável e sem recado", () => {
    expect(resolveSwitchView({ state: openMonth, closedThrough: null, permissions: perms({ hasPin: false }) })).toMatchObject({
      disabled: false,
      note: null,
    })
  })

  it("período no futuro fica cinza pelo próprio estado", () => {
    expect(resolveSwitchView({ state: futureMonth, closedThrough: null, permissions: owner })).toMatchObject({
      disabled: true,
      label: "nothingToClose",
    })
  })
})

/** Resposta de POST /close: cada código do contrato leva a um destino de tela. */
describe("resposta do fechamento", () => {
  it("200 fecha e avisa", () => {
    expect(decideCloseResponse({ ok: true, status: 200 })).toEqual({ kind: "success" })
  })

  it("409 UNPAID_BLOCKERS abre o painel de bloqueadores", () => {
    expect(decideCloseResponse({ ok: false, status: 409, code: "UNPAID_BLOCKERS" })).toEqual({ kind: "blockers" })
  })

  it("428 PIN_NOT_SET manda criar o PIN e repetir", () => {
    expect(decideCloseResponse({ ok: false, status: 428, code: "PIN_NOT_SET" })).toEqual({ kind: "createPin" })
  })

  it("os demais códigos do contrato viram erro comum", () => {
    expect(decideCloseResponse({ ok: false, status: 409, code: "CLOSE_WOULD_REOPEN" })).toEqual({ kind: "error" })
    expect(decideCloseResponse({ ok: false, status: 403, code: "FORBIDDEN" })).toEqual({ kind: "error" })
    expect(decideCloseResponse({ ok: false, status: 400, code: "INVALID_TODAY" })).toEqual({ kind: "error" })
    expect(decideCloseResponse({ ok: false, status: 500 })).toEqual({ kind: "error" })
  })

  it("um 409 sem o código dos bloqueadores não abre o painel", () => {
    expect(decideCloseResponse({ ok: false, status: 409 })).toEqual({ kind: "error" })
    expect(decideCloseResponse({ ok: false, status: 409, code: 42 })).toEqual({ kind: "error" })
  })
})

/** Resposta de POST /reopen: 401 PIN_REQUIRED não pode fechar o diálogo. */
describe("resposta da reabertura", () => {
  it("200 reabre e avisa", () => {
    expect(decideReopenResponse({ ok: true, status: 200 })).toEqual({ kind: "success" })
  })

  it("401 PIN_REQUIRED mantém o diálogo aberto", () => {
    expect(decideReopenResponse({ ok: false, status: 401, code: "PIN_REQUIRED" })).toEqual({ kind: "pinRequired" })
  })

  it("os demais viram erro comum", () => {
    expect(decideReopenResponse({ ok: false, status: 409, code: "NOTHING_TO_REOPEN" })).toEqual({ kind: "error" })
    expect(decideReopenResponse({ ok: false, status: 403, code: "FORBIDDEN" })).toEqual({ kind: "error" })
    expect(decideReopenResponse({ ok: false, status: 500 })).toEqual({ kind: "error" })
  })
})

/** Como o diálogo de reabertura nasce, conforme quem está olhando. */
describe("modo do diálogo de reabertura", () => {
  it("com PIN pede o PIN; sem PIN e podendo criar, cria antes; sem poder, trava", () => {
    expect(reopenDialogMode(owner)).toBe("pin")
    expect(reopenDialogMode(perms({ hasPin: false }))).toBe("createPin")
    expect(reopenDialogMode(perms({ hasPin: false, canManagePin: false }))).toBe("blocked")
    expect(reopenDialogMode(perms({ canManageClosing: false }))).toBe("blocked")
  })
})

/** Corpo do 409: vem do servidor, então nada aqui pode confiar no formato. */
describe("leitura dos bloqueadores", () => {
  it("lê contagem, faixa e amostra", () => {
    expect(
      readUnpaidBlockers({
        count: 3,
        firstDate: "2026-08-02",
        lastDate: "2026-08-29",
        sample: [{ id: "a", date: "2026-08-02", description: "Aluguel", amount: 1200.5, status: "Pending" }],
      }),
    ).toEqual({
      count: 3,
      firstDate: "2026-08-02",
      lastDate: "2026-08-29",
      sample: [{ id: "a", date: "2026-08-02", description: "Aluguel", amount: 1200.5 }],
    })
  })

  it("corpo estranho vira o painel vazio em vez de quebrar a tela", () => {
    expect(readUnpaidBlockers(null)).toEqual({ count: 0, firstDate: null, lastDate: null, sample: [] })
    expect(readUnpaidBlockers({ count: "3", firstDate: 7, sample: "nada" })).toEqual({
      count: 0,
      firstDate: null,
      lastDate: null,
      sample: [],
    })
  })

  it("descarta linha de amostra sem id, sem dia legível ou sem valor, e aceita descrição vazia", () => {
    const body = {
      count: 2,
      sample: [
        { id: "a", date: "31/08/2026", amount: 1 },
        { id: 9, date: "2026-08-31", amount: 1 },
        { id: "b", date: "2026-08-31", amount: "1" },
        { id: "c", date: "2026-08-31", description: null, amount: 10 },
      ],
    }
    expect(readUnpaidBlockers(body).sample).toEqual([{ id: "c", date: "2026-08-31", description: null, amount: 10 }])
  })
})

/**
 * "Ver esses lançamentos" joga a chave de dia no seletor de período, que trabalha com Date
 * LOCAL. Montar por `new Date("2026-08-02")` traria o dia anterior a oeste de Greenwich.
 */
describe("chave de dia para o seletor de período", () => {
  it("vira meia-noite local do mesmo dia", () => {
    const date = localDateOfDayKey("2026-08-02")
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 7, 2])
    expect([date.getHours(), date.getMinutes()]).toEqual([0, 0])
  })
})

/**
 * `closeThrough()` zera `confirmThrough` assim que a resposta chega, mas o AlertDialog ainda
 * está saindo. O texto exibido não pode piscar com a data vazia durante essa animação.
 */
describe("data exibida na confirmação de fechamento", () => {
  it("mantém o valor anterior quando a data pendente zera (diálogo fechando)", () => {
    expect(retainConfirmThroughForDisplay(null, "2026-08-31")).toBe("2026-08-31")
  })

  it("troca para o valor novo assim que uma nova confirmação abre", () => {
    expect(retainConfirmThroughForDisplay("2026-09-30", "2026-08-31")).toBe("2026-09-30")
  })

  it("sem nada exibido antes e sem pendente agora, continua nulo", () => {
    expect(retainConfirmThroughForDisplay(null, null)).toBeNull()
  })
})
