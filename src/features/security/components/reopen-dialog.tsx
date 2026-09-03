"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

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
import { isDayKey, MIN_DAY_KEY } from "../lib/date-closing"
import { PIN_TOKEN_HEADER } from "../lib/http"
import { decideReopenResponse, reopenDialogMode, type ClosingPermissions } from "../lib/switch-flows"
import { useDateClosing } from "./date-closing-provider"
import { useDateClosingGuard } from "./date-closing-guard"

interface ReopenDialogProps {
  /** Dia a partir do qual reabrir; o diálogo monta uma vez por pedido (o pai passa `key`). */
  from: string
  permissions: ClosingPermissions
  onClose: () => void
  /**
   * Deixa escolher o dia aqui dentro. No switch do "Registro de Transações" o dia vem do período
   * em tela e não se discute; em Configurações não há período em tela, então a janela pergunta.
   */
  allowChangeFrom?: boolean
  /** Chamado só quando a reabertura deu certo (a aba Segurança recarrega o estado do servidor). */
  onReopened?: () => void
}

const digitsOnly = (value: string) => value.replace(/\D/g, "").slice(0, 4)

/**
 * Reabrir com alcance: primeiro o diálogo diz o que a reabertura desprotege, e só depois pede o
 * PIN. Na primeira vez (visitante da demo, instalação nova) ele também CRIA o PIN, tudo numa
 * janela só, porque exigir um passeio até Configurações antes do primeiro gesto seria cruel.
 *
 * A janela nunca fica sem saída: erro nenhum a fecha, e cancelar/Escape sempre voltam para a tela.
 */
export function ReopenDialog({ from, permissions, onClose, allowChangeFrom = false, onReopened }: ReopenDialogProps) {
  const t = useTranslations("transactions.closing")
  const tDialog = useTranslations("security.dialog")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const { state, refresh } = useDateClosing()
  const guard = useDateClosingGuard()

  // O dia pedido: nasce do que o pai mandou e só muda quando a janela oferece o campo de data.
  const [fromValue, setFromValue] = React.useState(from)
  const [preview, setPreview] = React.useState<{ count: number; closedThrough: string | null } | null>(null)
  const [scopeFailed, setScopeFailed] = React.useState(false)
  const [creating, setCreating] = React.useState(() => reopenDialogMode(permissions) === "createPin")
  const [pin, setPin] = React.useState("")
  const [confirmPin, setConfirmPin] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  // O estado desabilita o botão no próximo pintar; a ref recusa o segundo envio NESTE.
  const busyRef = React.useRef(false)

  const dayFormatter = React.useMemo(
    () => createDateFormatter(locale, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }),
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

  // O alcance é só informação: a rota de prévia não escreve nada e não pede PIN.
  //
  // Quando ela falha (403, rede caída) a janela DIZ que não conseguiu mostrar o alcance, em vez
  // de ficar para sempre no "carregando" com o campo do PIN esperando. O campo continua ligado
  // de propósito: a prévia é informação, a trava de verdade é a do servidor (que responde 423 e
  // 401), e reabrir se desfaz fechando de novo. Barrar o PIN por causa de um tropeço de rede
  // deixaria a pessoa sem saída, que é justamente o que esta janela promete nunca fazer.
  React.useEffect(() => {
    // Data pela metade (o campo `type="date"` passa por "2026-0-01" enquanto se digita) não vai
    // ao servidor: o alcance fica em branco e o botão continua desligado.
    if (!isDayKey(fromValue)) return
    let active = true
    void (async () => {
      try {
        const response = await fetch(`/api/security/date-closing/reopen-preview?from=${encodeURIComponent(fromValue)}`, {
          cache: "no-store",
        })
        if (!response.ok) {
          if (active) setScopeFailed(true)
          return
        }
        const body = (await response.json()) as Record<string, unknown>
        if (!active) return
        setPreview({
          count: typeof body.count === "number" ? body.count : 0,
          closedThrough: typeof body.closedThrough === "string" ? body.closedThrough : null,
        })
      } catch {
        if (active) setScopeFailed(true)
      }
    })()
    return () => {
      active = false
    }
  }, [fromValue])

  function close() {
    if (busy) return
    onClose()
  }

  /** Cria o PIN. Devolve false quando já mostrou o erro na própria janela. */
  async function createPin(): Promise<boolean> {
    if (pin !== confirmPin) {
      setError(tDialog("pinMismatch"))
      return false
    }
    const response = await fetch("/api/security/pin", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, confirm: confirmPin }),
    })
    if (response.ok) {
      setCreating(false)
      await refresh()
      return true
    }
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
    setError(body.code === "PIN_MISMATCH" ? tDialog("pinMismatch") : tDialog("genericError"))
    return false
  }

  /** Confere o PIN e devolve o token, ou null quando já mostrou o erro. */
  async function verifyPin(): Promise<{ token: string; expiresAt: string } | null> {
    const response = await fetch("/api/security/pin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    })
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (response.ok) {
      if (typeof body.token === "string" && typeof body.expiresAt === "string") {
        return { token: body.token, expiresAt: body.expiresAt }
      }
      setError(tDialog("genericError"))
      return null
    }
    if (response.status === 401) {
      setPin("")
      setError(tDialog("attemptsLeft", { count: typeof body.attemptsLeft === "number" ? body.attemptsLeft : 0 }))
      return null
    }
    if (response.status === 429) {
      const until = typeof body.lockedUntil === "string" ? new Date(body.lockedUntil) : null
      setError(tDialog("locked", { time: until ? timeFormatter.format(until) : "--:--" }))
      return null
    }
    if (response.status === 428 && permissions.canManagePin) {
      // O PIN sumiu entre uma coisa e outra: a janela vira criação em vez de morrer em erro.
      setCreating(true)
      setPin("")
      setConfirmPin("")
      setError(null)
      return null
    }
    setError(tDialog("genericError"))
    return null
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      if (creating && !(await createPin())) return

      const token = await verifyPin()
      if (!token) return

      // O guard fica com o token (o interceptador anexa o cabeçalho nas escritas seguintes); aqui
      // o cabeçalho vai explícito, para não depender da ordem em que o React aplica o estado.
      guard.adoptToken(token.token, token.expiresAt)
      const response = await fetch("/api/security/date-closing/reopen", {
        method: "POST",
        headers: { "Content-Type": "application/json", [PIN_TOKEN_HEADER]: token.token },
        body: JSON.stringify({ from: fromValue }),
      })
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
      const outcome = decideReopenResponse({ ok: response.ok, status: response.status, code: body.code })

      if (outcome.kind === "success") {
        await refresh()
        toast.success(t("reopenSuccess"))
        onReopened?.()
        onClose()
        return
      }
      setPin("")
      // 401 é o token que venceu no caminho: a janela continua aberta para digitar de novo.
      setError(
        outcome.kind === "pinRequired"
          ? tDialog("genericError")
          : typeof body.error === "string"
            ? body.error
            : tCommon("genericError"),
      )
    } catch {
      setError(tCommon("genericError"))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const canSubmit = (creating ? pin.length === 4 && confirmPin.length === 4 : pin.length === 4) && isDayKey(fromValue)
  // A prévia é a fonte do corte; se ela não veio, o estado do provider serve (o diálogo só
  // abre com corte definido, então uma das duas SEMPRE tem valor).
  const closedThrough = preview?.closedThrough ?? state?.closedThrough ?? null
  // Três estados, nunca dois: alcance pronto, alcance que não veio, ou ainda carregando. A prévia
  // que chegou sem corte cai no mesmo balde da que não chegou — o texto seria uma frase pela
  // metade, e prometer menos é melhor que prometer errado.
  const scopeText =
    preview && closedThrough
      ? t("reopenScope", { from: formatDay(fromValue), closedThrough: formatDay(closedThrough), count: preview.count })
      : scopeFailed || preview
        ? t("reopenScopeUnavailable")
        : tCommon("loading")

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
          <DialogTitle>{creating ? t("createPinTitle") : t("reopenTitle")}</DialogTitle>
          <DialogDescription>{scopeText}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {allowChangeFrom && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="date-closing-reopen-from">{t("reopenFromLabel")}</Label>
              <Input
                id="date-closing-reopen-from"
                type="date"
                // Teto e piso: acima do corte não há o que reabrir (409), e abaixo de 1900 a
                // chave nem é lida como data (400). O seletor não oferece nem um nem outro.
                min={MIN_DAY_KEY}
                max={closedThrough ?? undefined}
                value={fromValue}
                onChange={(event) => {
                  // O alcance some junto com a data antiga: melhor em branco por um instante que
                  // dizendo o alcance de outro dia.
                  setError(null)
                  setPreview(null)
                  setScopeFailed(false)
                  setFromValue(event.target.value)
                }}
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="date-closing-reopen-pin">{tDialog("pinLabel")}</Label>
            <Input
              id="date-closing-reopen-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              aria-label={tDialog("pinLabel")}
              placeholder={tDialog("pinPlaceholder")}
              value={pin}
              onChange={(event) => {
                setError(null)
                setPin(digitsOnly(event.target.value))
              }}
            />
          </div>

          {creating && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="date-closing-reopen-pin-confirm">{tDialog("confirmPinLabel")}</Label>
              <Input
                id="date-closing-reopen-pin-confirm"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                aria-label={tDialog("confirmPinLabel")}
                placeholder={tDialog("pinPlaceholder")}
                value={confirmPin}
                onChange={(event) => {
                  setError(null)
                  setConfirmPin(digitsOnly(event.target.value))
                }}
              />
            </div>
          )}

          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={close}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={busy || !canSubmit} aria-busy={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {tDialog("proceed")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
