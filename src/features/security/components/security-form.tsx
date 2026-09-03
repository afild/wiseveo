"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createDateFormatter } from "@/i18n/format"
import { addDays, dayKeyOfLocal, isDayKey } from "../lib/date-closing"
import type { SecurityContext } from "../lib/security-context"
import { decideCloseResponse, readUnpaidBlockers, type ClosingPermissions, type UnpaidBlockersView } from "../lib/switch-flows"
import { BlockersPanel } from "./blockers-panel"
import { useDateClosing } from "./date-closing-provider"
import { useDateClosingGuard } from "./date-closing-guard"
import { ReopenDialog } from "./reopen-dialog"

const digitsOnly = (value: string) => value.replace(/\D/g, "").slice(0, 4)

/** Nada a assinar: o dia só precisa nascer no navegador, não mudar sozinho depois. */
const noSubscribe = () => () => {}

/**
 * "Hoje" no fuso de quem olha, ou null no servidor e no primeiro pintar. O fuso do servidor não
 * é o da pessoa, então um dia chutado no HTML faria o máximo do seletor mudar debaixo dela na
 * hidratação. A chave de dia é a MESMA string enquanto o dia durar, então o React não repinta à
 * toa.
 */
function useLocalToday(): string | null {
  return React.useSyncExternalStore(
    noSubscribe,
    () => dayKeyOfLocal(new Date()),
    () => null,
  )
}

/**
 * Configurações > Segurança: o PIN de fechamento e o corte de datas, longe do calor do dia a dia.
 *
 * O switch do "Registro de Transações" fecha o período que está em tela; aqui a pessoa escolhe a
 * data na mão, vê desde quando está fechado e quando o PIN foi definido. Quem não manda no
 * fechamento (convidado sem poder, sessão de vitrine) continua vendo os textos de estado, com os
 * botões desligados: o estado é informação de todo mundo que enxerga a conta.
 *
 * O que já existe é reaproveitado inteiro: o painel de bloqueadores e a janela de reabertura são
 * os mesmos do switch, sem segunda cópia.
 */
export function SecurityForm({ readOnly, canManagePin, state }: SecurityContext) {
  const t = useTranslations("settings.security")
  const tDialog = useTranslations("security.dialog")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const router = useRouter()
  const { refresh } = useDateClosing()
  const guard = useDateClosingGuard()

  const [pinOpen, setPinOpen] = React.useState(false)
  const [pin, setPin] = React.useState("")
  const [confirmPin, setConfirmPin] = React.useState("")
  const [pinError, setPinError] = React.useState<string | null>(null)

  const [closeOpen, setCloseOpen] = React.useState(false)
  const [closeDate, setCloseDate] = React.useState("")
  const [closeError, setCloseError] = React.useState<string | null>(null)

  const [blockers, setBlockers] = React.useState<UnpaidBlockersView | null>(null)
  const [reopenFrom, setReopenFrom] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  // O estado desabilita o botão no próximo pintar; a ref recusa o segundo clique NESTE.
  const busyRef = React.useRef(false)

  const today = useLocalToday()

  const dayFormatter = React.useMemo(
    () => createDateFormatter(locale, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }),
    [locale],
  )
  // O PIN guarda um INSTANTE (ISO), não uma chave de dia: nada de meio-dia UTC aqui.
  const instantFormatter = React.useMemo(
    () => createDateFormatter(locale, { day: "2-digit", month: "2-digit", year: "numeric" }),
    [locale],
  )
  const formatDay = React.useCallback(
    (key: string) => dayFormatter.format(new Date(`${key}T12:00:00.000Z`)),
    [dayFormatter],
  )

  const permissions: ClosingPermissions = {
    hasPin: state.hasPin,
    canManageClosing: state.canManageClosing,
    canManagePin: state.canManagePin,
  }

  const pinAt = state.pinUpdatedAt ? new Date(state.pinUpdatedAt) : null
  const pinStateText = !state.hasPin
    ? t("pinNotSet")
    : pinAt && !Number.isNaN(pinAt.getTime())
      ? t("pinDefinedAt", { date: instantFormatter.format(pinAt) })
      : t("pinDefined")

  const closedText = state.closedThrough
    ? t("closedThroughLabel", { date: formatDay(state.closedThrough) })
    : t("noClosedDates")

  // ADMIN convidado pode fechar, mas não pode criar o PIN: sem PIN, ele só informa e pede ao dono.
  const missingPin = state.canManageClosing && !state.hasPin && !state.canManagePin
  const closeMin = state.closedThrough ? addDays(state.closedThrough, 1) : null
  const nothingToClose = today !== null && closeMin !== null && closeMin > today
  const canReopen = state.closedThrough !== null && (state.hasPin || state.canManagePin)

  function openPinDialog() {
    setPin("")
    setConfirmPin("")
    setPinError(null)
    setPinOpen(true)
  }

  function openCloseDialog() {
    const day = today ?? dayKeyOfLocal(new Date())
    const yesterday = addDays(day, -1)
    // Ontem é o padrão; com um corte recente, o primeiro dia ainda aberto. Nunca depois de hoje.
    const suggestion = closeMin !== null && closeMin > yesterday ? closeMin : yesterday
    setCloseDate(suggestion > day ? day : suggestion)
    setCloseError(null)
    setCloseOpen(true)
  }

  /**
   * `retryAfterPin` só é verdadeiro na primeira volta: um 428 leva à criação do PIN e a UMA
   * repetição, nunca a um vaivém infinito entre a janela do PIN e a rota.
   */
  async function submitClose(through: string, retryAfterPin: boolean): Promise<void> {
    const response = await fetch("/api/security/date-closing/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ through, today: dayKeyOfLocal(new Date()) }),
    })
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
    const outcome = decideCloseResponse({ ok: response.ok, status: response.status, code: body.code })

    if (outcome.kind === "success") {
      setCloseOpen(false)
      await refresh()
      router.refresh()
      toast.success(t("closeSuccess"))
      return
    }
    if (outcome.kind === "blockers") {
      setCloseOpen(false)
      setBlockers(readUnpaidBlockers(body))
      return
    }
    if (outcome.kind === "createPin" && retryAfterPin && state.canManagePin) {
      // A janela de criar o PIN é do guard e mora acima desta tela: fecho a minha antes, para não
      // empilhar duas janelas em cima da mesma pergunta.
      setCloseOpen(false)
      if (await guard.requestPinCreation()) {
        router.refresh()
        await submitClose(through, false)
      }
      return
    }
    // Texto da própria rota, já traduzido; nunca o código estável do contrato.
    setCloseError(typeof body.error === "string" ? body.error : tCommon("genericError"))
  }

  async function handleClose() {
    if (busyRef.current || !isDayKey(closeDate)) return
    busyRef.current = true
    setBusy(true)
    setCloseError(null)
    try {
      await submitClose(closeDate, true)
    } catch {
      setCloseError(tCommon("genericError"))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function handleSavePin() {
    if (busyRef.current) return
    if (pin !== confirmPin) {
      setPinError(tDialog("pinMismatch"))
      return
    }
    busyRef.current = true
    setBusy(true)
    setPinError(null)
    try {
      const response = await fetch("/api/security/pin", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, confirm: confirmPin }),
      })
      if (response.ok) {
        setPinOpen(false)
        setPin("")
        setConfirmPin("")
        await refresh()
        router.refresh()
        toast.success(t("pinSaved"))
        return
      }
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
      setPinError(
        body.code === "PIN_MISMATCH"
          ? tDialog("pinMismatch")
          : typeof body.error === "string"
            ? body.error
            : tCommon("genericError"),
      )
    } catch {
      setPinError(tCommon("genericError"))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {canManagePin && (
        <Card>
          <CardHeader>
            <CardTitle>{t("pinTitle")}</CardTitle>
            <CardDescription>{t("pinDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">{pinStateText}</p>
            <Button type="button" variant="outline" className="cursor-pointer" onClick={openPinDialog}>
              {state.hasPin ? t("redefinePin") : t("definePin")}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("closingTitle")}</CardTitle>
          <CardDescription>{t("closingDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">{closedText}</p>
          {(readOnly || missingPin || nothingToClose) && (
            <p className="text-muted-foreground text-sm">
              {readOnly ? t("readOnly") : missingPin ? t("askOwnerPin") : t("allClosed")}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="cursor-pointer"
              disabled={readOnly || missingPin || nothingToClose}
              onClick={openCloseDialog}
            >
              {t("closeThroughDate")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer"
              disabled={readOnly || !canReopen}
              onClick={() => setReopenFrom(state.closedThrough)}
            >
              {t("reopenFromDate")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={pinOpen}
        onOpenChange={(next) => {
          if (!next && !busy) setPinOpen(false)
        }}
      >
        <DialogContent showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>{state.hasPin ? t("redefinePinTitle") : t("definePinTitle")}</DialogTitle>
            <DialogDescription>
              {state.hasPin ? t("redefinePinDescription") : t("definePinDescription")}
            </DialogDescription>
          </DialogHeader>

          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              void handleSavePin()
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="settings-security-pin">{tDialog("pinLabel")}</Label>
              <Input
                id="settings-security-pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                aria-label={tDialog("pinLabel")}
                placeholder={tDialog("pinPlaceholder")}
                value={pin}
                onChange={(event) => {
                  setPinError(null)
                  setPin(digitsOnly(event.target.value))
                }}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="settings-security-pin-confirm">{tDialog("confirmPinLabel")}</Label>
              <Input
                id="settings-security-pin-confirm"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                aria-label={tDialog("confirmPinLabel")}
                placeholder={tDialog("pinPlaceholder")}
                value={confirmPin}
                onChange={(event) => {
                  setPinError(null)
                  setConfirmPin(digitsOnly(event.target.value))
                }}
              />
            </div>

            {pinError && (
              <p role="alert" className="text-destructive text-sm">
                {pinError}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setPinOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="submit" disabled={busy || pin.length !== 4 || confirmPin.length !== 4} aria-busy={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                {tCommon("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={closeOpen}
        onOpenChange={(next) => {
          if (!next && !busy) setCloseOpen(false)
        }}
      >
        <DialogContent showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>{t("closeTitle")}</DialogTitle>
            <DialogDescription>{t("closeDescription")}</DialogDescription>
          </DialogHeader>

          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              void handleClose()
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="settings-security-close-date">{t("closeDateLabel")}</Label>
              <Input
                id="settings-security-close-date"
                type="date"
                min={closeMin ?? undefined}
                max={today ?? undefined}
                value={closeDate}
                onChange={(event) => {
                  setCloseError(null)
                  setCloseDate(event.target.value)
                }}
              />
            </div>

            {closeError && (
              <p role="alert" className="text-destructive text-sm">
                {closeError}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setCloseOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="submit" disabled={busy || !isDayKey(closeDate)} aria-busy={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                {tCommon("confirm")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <BlockersPanel blockers={blockers} onClose={() => setBlockers(null)} />

      {reopenFrom !== null && (
        <ReopenDialog
          key={reopenFrom}
          from={reopenFrom}
          permissions={permissions}
          allowChangeFrom
          onReopened={() => router.refresh()}
          onClose={() => setReopenFrom(null)}
        />
      )}
    </div>
  )
}
