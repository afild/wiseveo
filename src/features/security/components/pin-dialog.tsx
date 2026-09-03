"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
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
import { dayKeyOfLocal } from "../lib/date-closing"
import type { DialogRequest, DialogResult } from "../lib/guard-machine"

interface PinDialogProps {
  request: DialogRequest
  /** Se existe PIN e se esta pessoa pode criar um; vem do estado do provider. */
  hasPin: boolean
  canManagePin: boolean
  onResolve: (result: DialogResult) => void
}

const digitsOnly = (value: string) => value.replace(/\D/g, "").slice(0, 4)

/**
 * A janela que aparece quando o servidor recusa a escrita com 423, e também quando alguém pede
 * o PIN de propósito (parcelas, reabertura). Ela NUNCA some sem responder: fechar pelo X, pelo
 * Escape ou clicando fora resolve como "alterar a data", que é a recusa.
 *
 * Monta uma vez por pedido (o guard passa `key`), então o estado inicial vem direto das props:
 * não existe efeito de limpeza, nem campo preenchido do pedido anterior.
 */
export function PinDialog({ request, hasPin, canManagePin, onResolve }: PinDialogProps) {
  const t = useTranslations("security.dialog")
  const tCommon = useTranslations("common")
  const locale = useLocale()

  const mode = request.mode

  const [pin, setPin] = React.useState("")
  const [confirmPin, setConfirmPin] = React.useState("")
  const [date, setDate] = React.useState(() => dayKeyOfLocal(new Date()))
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  // Começa true quando ainda não existe PIN; também vira true se o servidor avisar (428) no meio
  // da conferência que o PIN sumiu.
  const [mustCreatePin, setMustCreatePin] = React.useState(mode === "createPin" || !hasPin)

  const dayFormatter = React.useMemo(
    () => createDateFormatter(locale, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }),
    [locale],
  )
  const periodFormatter = React.useMemo(
    () => createDateFormatter(locale, { month: "2-digit", year: "numeric", timeZone: "UTC" }),
    [locale],
  )
  const timeFormatter = React.useMemo(
    () => createDateFormatter(locale, { hour: "2-digit", minute: "2-digit" }),
    [locale],
  )

  const formatDay = React.useCallback(
    (key: string) => dayFormatter.format(new Date(`${key}T12:00:00.000Z`)),
    [dayFormatter],
  )
  const formatPeriodKey = React.useCallback(
    (key: string) => periodFormatter.format(new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(4, 6)) - 1, 15, 12))),
    [periodFormatter],
  )

  function close() {
    if (busy) return
    onResolve({ kind: "changeDate" })
  }

  async function verifyPin(candidate: string, pinCreated = false) {
    const response = await fetch("/api/security/pin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: candidate }),
    })
    if (response.ok) {
      const body = (await response.json()) as { token?: unknown; expiresAt?: unknown }
      if (typeof body.token === "string" && typeof body.expiresAt === "string") {
        onResolve({ kind: "token", token: body.token, expiresAt: body.expiresAt, pinCreated })
        return
      }
      setError(t("genericError"))
      return
    }
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (response.status === 401) {
      const left = typeof body.attemptsLeft === "number" ? body.attemptsLeft : 0
      setError(t("attemptsLeft", { count: left }))
      return
    }
    if (response.status === 429) {
      const until = typeof body.lockedUntil === "string" ? new Date(body.lockedUntil) : null
      setError(t("locked", { time: until ? timeFormatter.format(until) : "--:--" }))
      return
    }
    if (response.status === 428) {
      setMustCreatePin(true)
      setPin("")
      setError(null)
      return
    }
    setError(t("genericError"))
  }

  async function createPin(candidate: string, confirmation: string) {
    const response = await fetch("/api/security/pin", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: candidate, confirm: confirmation }),
    })
    if (response.ok) return true
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
    setError(body.code === "PIN_MISMATCH" ? t("pinMismatch") : t("genericError"))
    return false
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    if (mode === "chooseDate") {
      if (!date) return
      onResolve({ kind: "chooseDate", date })
      return
    }

    setBusy(true)
    setError(null)
    try {
      if (mustCreatePin) {
        if (pin !== confirmPin) {
          setError(t("pinMismatch"))
          return
        }
        const created = await createPin(pin, confirmPin)
        if (!created) return
        if (mode === "createPin") {
          onResolve({ kind: "pinCreated" })
          return
        }
        await verifyPin(pin, true)
        return
      }
      await verifyPin(pin)
    } catch {
      setError(t("genericError"))
    } finally {
      setBusy(false)
    }
  }

  const askOwner = mode === "pin" && (!request.canOverride || (mustCreatePin && !canManagePin))
  const showPinFields = !askOwner && mode !== "chooseDate"
  const canSubmit =
    mode === "chooseDate"
      ? date.length > 0
      : mustCreatePin
        ? pin.length === 4 && confirmPin.length === 4
        : pin.length === 4

  const title =
    mode === "createPin" ? t("createPinTitle") : mode === "chooseDate" ? t("chooseAnotherDate") : t("title")
  const description =
    mode === "createPin" ? t("createPinDescription") : mode === "chooseDate" ? t("recurringDateMoves") : t("description")
  const cancelLabel = mode === "pin" ? t("changeDate") : tCommon("cancel")
  const submitLabel =
    mode === "createPin"
      ? tCommon("save")
      : mode === "chooseDate"
        ? t("proceed")
        : mustCreatePin
          ? t("createAndProceed")
          : t("proceed")

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <DialogContent
        showCloseButton={!busy}
        onInteractOutside={(event) => {
          if (busy) event.preventDefault()
        }}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {mode !== "createPin" && (
          <div className="text-muted-foreground flex flex-col gap-1 text-sm">
            {request.days.length > 0 && (
              <p>{t("daysLabel", { days: request.days.map(formatDay).join(", ") })}</p>
            )}
            {request.periods.length > 0 && (
              <p>{t("periodsLabel", { periods: request.periods.map(formatPeriodKey).join(", ") })}</p>
            )}
            {request.closedThrough && (
              <p>{t("closedThroughLabel", { date: formatDay(request.closedThrough) })}</p>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {mode === "chooseDate" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="date-closing-new-date">{t("chooseDateLabel")}</Label>
              <Input
                id="date-closing-new-date"
                type="date"
                required
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
          )}

          {showPinFields && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="date-closing-pin">{t("pinLabel")}</Label>
              <Input
                id="date-closing-pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                aria-label={t("pinLabel")}
                placeholder={t("pinPlaceholder")}
                value={pin}
                onChange={(event) => {
                  setError(null)
                  setPin(digitsOnly(event.target.value))
                }}
              />
            </div>
          )}

          {showPinFields && mustCreatePin && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="date-closing-pin-confirm">{t("confirmPinLabel")}</Label>
              <Input
                id="date-closing-pin-confirm"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                aria-label={t("confirmPinLabel")}
                placeholder={t("pinPlaceholder")}
                value={confirmPin}
                onChange={(event) => {
                  setError(null)
                  setConfirmPin(digitsOnly(event.target.value))
                }}
              />
            </div>
          )}

          {askOwner && <p className="text-muted-foreground text-sm">{t("askOwner")}</p>}

          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={close}>
              {cancelLabel}
            </Button>
            {!askOwner && (
              <Button type="submit" disabled={busy || !canSubmit} aria-busy={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                {submitLabel}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
