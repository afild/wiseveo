"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ShieldCheck } from "lucide-react"

export interface SetupSecurityState {
  pin: string
  confirm: string
}

interface SecurityStepProps {
  security: SetupSecurityState
  onSecurityChange: (field: keyof SetupSecurityState, value: string) => void
  /** Pular: avança sem gravar nada (e limpa o que estiver digitado). */
  onSkip: () => void
  onNext: () => void
  onBack: () => void
}

const digitsOnly = (value: string) => value.replace(/\D/g, "").slice(0, 4)

/**
 * Passo opcional entre "Administrador" e "Integrações": cria o PIN que será pedido
 * toda vez que alguém quiser gravar dentro de um período fechado.
 *
 * Nada aqui é obrigatório. "Pular" avança sem gravar, e o Finalizar só manda o PIN
 * quando ele tem 4 dígitos e os dois campos são iguais — em reconfiguração, isso é o
 * que impede o passo de apagar um PIN que já existe.
 */
export function SecurityStep({ security, onSecurityChange, onSkip, onNext, onBack }: SecurityStepProps) {
  const t = useTranslations("setup.security")
  const tc = useTranslations("setup.common")
  const [error, setError] = useState<string | null>(null)

  const empty = security.pin === "" && security.confirm === ""

  const handleNext = () => {
    // Campos em branco valem como "Pular": ninguém fica preso num passo opcional.
    if (empty) {
      onSkip()
      return
    }
    if (security.pin.length !== 4) {
      setError(t("errors.pinInvalid"))
      return
    }
    if (security.pin !== security.confirm) {
      setError(t("errors.pinMismatch"))
      return
    }
    setError(null)
    onNext()
  }

  const change = (field: keyof SetupSecurityState) => (value: string) => {
    setError(null)
    onSecurityChange(field, digitsOnly(value))
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="text-center">
        <div className="inline-flex p-3 rounded-xl bg-primary/10 border border-primary/20 mb-3">
          <ShieldCheck className="w-6 h-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">{t("title")}</h2>
        <p className="text-muted-foreground mt-1 text-sm">{t("subtitle")}</p>
      </div>

      <div className="rounded-xl border border-muted bg-muted/20 p-4 text-sm text-muted-foreground">
        {t("description")}
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="setup-pin">{t("pinLabel")}</Label>
          <Input
            id="setup-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            aria-label={t("pinLabel")}
            placeholder={t("pinPlaceholder")}
            value={security.pin}
            onChange={(e) => change("pin")(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="setup-pin-confirm">{t("confirmLabel")}</Label>
          <Input
            id="setup-pin-confirm"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            aria-label={t("confirmLabel")}
            placeholder={t("pinPlaceholder")}
            value={security.confirm}
            onChange={(e) => change("confirm")(e.target.value)}
          />
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">{t("laterHint")}</p>
      </div>

      {/* Navigation */}
      <div className="flex flex-col gap-3 pt-2 sm:flex-row">
        <Button variant="outline" onClick={onBack} className="flex-1">
          {tc("back")}
        </Button>
        <Button variant="ghost" onClick={onSkip} className="flex-1">
          {t("skip")}
        </Button>
        <Button onClick={handleNext} className="flex-1">
          {tc("next")}
        </Button>
      </div>
    </div>
  )
}
