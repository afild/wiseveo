"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { CardAction } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { useDateRange } from "@/contexts/date-range-context"
import { createDateFormatter } from "@/i18n/format"
import { computeSwitchState, dayKeyOfLocal, type SwitchLabel } from "../lib/date-closing"
import {
  decideCloseResponse,
  decideSwitchToggle,
  localDateOfDayKey,
  readUnpaidBlockers,
  resolveSwitchView,
  retainConfirmThroughForDisplay,
  type ClosingPermissions,
  type UnpaidBlockersView,
} from "../lib/switch-flows"
import { BlockersPanel } from "./blockers-panel"
import { useDateClosing } from "./date-closing-provider"
import { useDateClosingGuard } from "./date-closing-guard"
import { ReopenDialog } from "./reopen-dialog"

const LABEL_KEYS = {
  open: "stateOpen",
  closed: "stateClosed",
  nothingToClose: "nothingToClose",
} as const satisfies Record<Exclude<SwitchLabel, "closedThrough">, string>

/**
 * Estado do switch para o período em tela. Enquanto o provider não respondeu (`state === null`)
 * NADA depende de fuso nem de relógio: o primeiro pintar é igual no servidor e no navegador, e o
 * switch nasce cinza e mudo em vez de chutar "aberto" num banco fechado.
 */
function useClosingSwitch() {
  const { state } = useDateClosing()
  const { dateRange } = useDateRange()

  const permissions: ClosingPermissions = {
    hasPin: state?.hasPin ?? false,
    canManageClosing: state?.canManageClosing ?? false,
    canManagePin: state?.canManagePin ?? false,
  }

  const switchState =
    state === null
      ? null
      : computeSwitchState({
          from: dayKeyOfLocal(dateRange.from),
          to: dayKeyOfLocal(dateRange.to),
          today: dayKeyOfLocal(new Date()),
          closedThrough: state.closedThrough,
        })

  return {
    switchState,
    permissions,
    view: resolveSwitchView({ state: switchState, closedThrough: state?.closedThrough ?? null, permissions }),
  }
}

/**
 * Texto de estado do fechamento, para a `CardDescription` do cartão (o `CardAction` não comporta
 * texto variável no celular). Devolve null enquanto o estado não chegou.
 */
export function useDateClosingLabel(): string | null {
  const t = useTranslations("transactions.closing")
  const locale = useLocale()
  const { view } = useClosingSwitch()

  const dayFormatter = React.useMemo(
    () => createDateFormatter(locale, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }),
    [locale],
  )

  if (view.label === null) return null

  const text =
    view.label === "closedThrough" && view.labelDate
      ? t("stateClosedThrough", { date: dayFormatter.format(new Date(`${view.labelDate}T12:00:00.000Z`)) })
      : t(LABEL_KEYS[view.label === "closedThrough" ? "closed" : view.label])

  return view.note === null ? text : `${text} ${t("askOwnerPin")}`
}

/**
 * O switch de fechamento no cabeçalho do "Registro de Transações". Ligar fecha até o último dia
 * do período em tela que já passou; desligar reabre a partir do primeiro dia dele.
 *
 * As três janelas que ele comanda (confirmar o fechamento, os bloqueadores não pagos e a
 * reabertura) vivem aqui dentro e SEMPRE têm saída: cancelar, Escape ou o X voltam para a tela,
 * e nenhum erro deixa a pessoa presa.
 */
export function DateClosingSwitch() {
  const t = useTranslations("transactions.closing")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const { refresh } = useDateClosing()
  const guard = useDateClosingGuard()
  const { setDateRange } = useDateRange()
  const { switchState, permissions, view } = useClosingSwitch()

  const [confirmThrough, setConfirmThrough] = React.useState<string | null>(null)
  // Só para EXIBIR: `confirmThrough` zera assim que a resposta do fechamento chega, mas o
  // AlertDialog ainda está saindo (anima por um instante) — sem isto o título piscaria "Fechar
  // lançamentos até ?" com a data vazia durante o fade-out. Mantém o último valor não nulo.
  const [displayThrough, setDisplayThrough] = React.useState<string | null>(null)
  const [blockers, setBlockers] = React.useState<UnpaidBlockersView | null>(null)
  const [reopenFrom, setReopenFrom] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  // O estado desabilita o botão no próximo pintar; a ref recusa o segundo clique NESTE.
  const busyRef = React.useRef(false)

  // Ajusta durante a própria renderização (padrão do React para "lembrar o valor anterior"):
  // atualiza já, sem esperar um efeito, senão o título abriria um pintar atrasado.
  const nextDisplayThrough = retainConfirmThroughForDisplay(confirmThrough, displayThrough)
  if (nextDisplayThrough !== displayThrough) setDisplayThrough(nextDisplayThrough)

  const dayFormatter = React.useMemo(
    () => createDateFormatter(locale, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }),
    [locale],
  )
  const formatDay = React.useCallback(
    (key: string) => dayFormatter.format(new Date(`${key}T12:00:00.000Z`)),
    [dayFormatter],
  )

  /**
   * `retryAfterPin` só é verdadeiro na primeira volta: um 428 leva à criação do PIN e a UMA
   * repetição, nunca a um vaivém infinito entre a janela do PIN e a rota.
   */
  async function closeThrough(through: string, retryAfterPin: boolean) {
    try {
      const response = await fetch("/api/security/date-closing/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ through, today: dayKeyOfLocal(new Date()) }),
      })
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
      const outcome = decideCloseResponse({ ok: response.ok, status: response.status, code: body.code })

      setConfirmThrough(null)
      if (outcome.kind === "success") {
        await refresh()
        toast.success(t("closeSuccess"))
        return
      }
      if (outcome.kind === "blockers") {
        setBlockers(readUnpaidBlockers(body))
        return
      }
      if (outcome.kind === "createPin" && retryAfterPin) {
        // O guard recarrega o estado quando o PIN nasce; recusar aqui só desiste do fechamento.
        if (await guard.requestPinCreation()) await closeThrough(through, false)
        return
      }
      // Texto da própria rota, já traduzido; nunca o código estável do contrato.
      toast.error(typeof body.error === "string" ? body.error : tCommon("genericError"))
    } catch {
      setConfirmThrough(null)
      toast.error(tCommon("genericError"))
    }
  }

  async function handleToggle(next: boolean) {
    if (busyRef.current) return
    const flow = decideSwitchToggle({ state: switchState, next, permissions })

    if (flow.kind === "confirmClose") {
      setConfirmThrough(flow.through)
      return
    }
    if (flow.kind === "createPinThenClose") {
      busyRef.current = true
      setBusy(true)
      try {
        if (await guard.requestPinCreation()) setConfirmThrough(flow.through)
      } finally {
        busyRef.current = false
        setBusy(false)
      }
      return
    }
    if (flow.kind === "reopen") setReopenFrom(flow.from)
  }

  async function handleConfirmClose() {
    if (busyRef.current || confirmThrough === null) return
    busyRef.current = true
    setBusy(true)
    try {
      await closeThrough(confirmThrough, true)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const closingToday = displayThrough !== null && displayThrough === dayKeyOfLocal(new Date())

  return (
    <CardAction className="flex items-center">
      <Switch
        checked={view.checked}
        disabled={view.disabled || busy}
        aria-label={t("switchAria")}
        onCheckedChange={(next) => void handleToggle(next)}
      />

      <AlertDialog
        open={confirmThrough !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmThrough(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("confirmCloseTitle", { date: displayThrough ? formatDay(displayThrough) : "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmCloseBody")}
              {closingToday && <span className="mt-2 block">{t("confirmCloseToday")}</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              aria-busy={busy}
              onClick={(event) => {
                // Sem isto o AlertDialog fecharia antes da resposta, e o painel de bloqueadores
                // (ou a janela do PIN) abriria no vazio.
                event.preventDefault()
                void handleConfirmClose()
              }}
            >
              {tCommon("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BlockersPanel
        blockers={blockers}
        onClose={() => setBlockers(null)}
        onViewBlockers={(firstDate, lastDate) =>
          setDateRange({ from: localDateOfDayKey(firstDate), to: localDateOfDayKey(lastDate) })
        }
      />

      {reopenFrom !== null && (
        <ReopenDialog
          key={reopenFrom}
          from={reopenFrom}
          permissions={permissions}
          onClose={() => setReopenFrom(null)}
        />
      )}
    </CardAction>
  )
}
