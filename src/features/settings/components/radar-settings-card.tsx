"use client"

import * as React from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MonetaryAmountInput } from "@/components/ui/monetary-amount-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { useMonetaryPreferences } from "@/contexts/monetary-preferences-context"
import {
  radarColorFor,
  rampGradient,
  rampValueAt,
} from "@/features/radar/lib/radar-color"
import {
  defaultRadarPreferences,
  MAX_HORIZON_DAYS,
  MIN_HORIZON_DAYS,
  resolveRadarPreferences,
  validateRadarPreferences,
  type RadarPreferences,
} from "@/features/radar/lib/radar-preferences"
import { formatNumberValue } from "@/lib/monetary"

/** Amostras da rampa, da esquerda para a direita, como fração entre vermelho e verde. */
const PREVIEW_STOPS = [0, 0.25, 0.5, 0.75, 1]

/** O rascunho da tela aceita campo vazio; `RadarPreferences` não. A validação é a ponte. */
type RadarDraft = Omit<RadarPreferences, "green" | "red"> & {
  green: number | null
  red: number | null
}

/**
 * Sem isto, uma falha de rede deixava a tela mostrando os padrões de fábrica com o botão Salvar
 * habilitado, e um clique distraído gravava 300/100 por cima do que o dono tinha configurado.
 */
type EstadoDaCarga = "carregando" | "pronto" | "falhou"

export function RadarSettingsCard() {
  const t = useTranslations("settings.monetary")
  const { preferences: monetary } = useMonetaryPreferences()

  const [draft, setDraft] = React.useState<RadarDraft>(defaultRadarPreferences)
  const [daysText, setDaysText] = React.useState(String(defaultRadarPreferences.horizonDays))
  const [saving, setSaving] = React.useState(false)
  const [carga, setCarga] = React.useState<EstadoDaCarga>("carregando")

  React.useEffect(() => {
    let active = true
    const controller = new AbortController()

    async function load() {
      try {
        const res = await fetch("/api/user/radar-preferences", {
          cache: "no-store",
          signal: controller.signal,
        })
        if (!active) return
        if (!res.ok) {
          setCarga("falhou")
          return
        }
        const json = await res.json()
        if (!active) return
        if (!json.success) {
          setCarga("falhou")
          return
        }
        const loaded = resolveRadarPreferences(json.data)
        setDraft(loaded)
        setDaysText(String(loaded.horizonDays))
        setCarga("pronto")
      } catch {
        // Pedido cancelado no desmonte cai aqui com `active` já falso e não mexe em estado.
        if (active) setCarga("falhou")
      }
    }

    load()
    return () => {
      active = false
      controller.abort()
    }
  }, [])

  const validation = React.useMemo(() => validateRadarPreferences(draft), [draft])

  const daysOutOfRange = React.useMemo(() => {
    const parsed = Number(daysText)
    return (
      daysText === "" ||
      !Number.isInteger(parsed) ||
      parsed < MIN_HORIZON_DAYS ||
      parsed > MAX_HORIZON_DAYS
    )
  }, [daysText])

  const amberPlaceholder = React.useMemo(() => {
    // Campo vazio não tem média para sugerir, e `null` não se compara com número.
    if (draft.green === null || draft.red === null) return ""
    if (draft.red >= draft.green) return ""
    return t("radarAmberAuto", {
      value: formatNumberValue((draft.green + draft.red) / 2, undefined, monetary),
    })
  }, [draft.green, draft.red, monetary, t])

  const previewPrefs = validation.ok ? validation.value : defaultRadarPreferences

  async function handleSave() {
    if (!validation.ok) {
      toast.error(t("radarInvalidOrder"))
      return
    }

    setSaving(true)
    try {
      const res = await fetch("/api/user/radar-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validation.value),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) {
        toast.error(t("radarError"))
        return
      }
      const saved = resolveRadarPreferences(json.data)
      setDraft(saved)
      setDaysText(String(saved.horizonDays))
      toast.success(t("radarSuccess"))
    } catch {
      toast.error(t("radarError"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("radarTitle")}</CardTitle>
        <CardDescription>{t("radarDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="radar-mode">{t("radarMode")}</Label>
          <Select
            value={draft.mode}
            onValueChange={(mode) =>
              setDraft((current) => ({
                ...current,
                mode: mode === "today" ? "today" : "lookahead",
              }))
            }
            disabled={saving}
          >
            <SelectTrigger id="radar-mode" className="cursor-pointer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lookahead">{t("radarModeLookahead")}</SelectItem>
              <SelectItem value="today">{t("radarModeToday")}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">{t("radarModeDesc")}</p>
        </div>

        {draft.mode === "lookahead" && (
          <div className="space-y-2">
            <Label htmlFor="radar-days">{t("radarDays")}</Label>
            <Input
              id="radar-days"
              inputMode="numeric"
              autoComplete="off"
              className="max-w-32"
              value={daysText}
              disabled={saving}
              onChange={(event) => {
                const raw = event.target.value.replace(/\D/g, "")
                setDaysText(raw)
                const parsed = Number(raw)
                if (
                  raw !== "" &&
                  Number.isInteger(parsed) &&
                  parsed >= MIN_HORIZON_DAYS &&
                  parsed <= MAX_HORIZON_DAYS
                ) {
                  setDraft((current) => ({ ...current, horizonDays: parsed }))
                }
              }}
              onBlur={() => setDaysText(String(draft.horizonDays))}
            />
            <p className="text-sm text-muted-foreground">{t("radarDaysDesc")}</p>
            {daysOutOfRange && (
              <p className="text-sm text-destructive">{t("radarDaysRange")}</p>
            )}
          </div>
        )}

        <Separator />

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="radar-green" className="flex items-center gap-2">
                <span
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: "var(--positive)" }}
                />
                {t("radarGreen")}
              </Label>
              <MonetaryAmountInput
                id="radar-green"
                value={draft.green}
                settings={monetary}
                disabled={saving}
                onChange={(value) => setDraft((current) => ({ ...current, green: value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="radar-amber" className="flex items-center gap-2">
                <span
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: "var(--warning)" }}
                />
                {t("radarAmber")}
              </Label>
              <MonetaryAmountInput
                id="radar-amber"
                value={draft.amber}
                settings={monetary}
                disabled={saving}
                placeholder={amberPlaceholder}
                onChange={(value) => setDraft((current) => ({ ...current, amber: value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="radar-red" className="flex items-center gap-2">
                <span
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: "var(--destructive)" }}
                />
                {t("radarRed")}
              </Label>
              <MonetaryAmountInput
                id="radar-red"
                value={draft.red}
                settings={monetary}
                disabled={saving}
                onChange={(value) => setDraft((current) => ({ ...current, red: value }))}
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{t("radarThresholdsDesc")}</p>
          {!validation.ok && (
            <p className="text-sm text-destructive">{t("radarInvalidOrder")}</p>
          )}
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">{t("radarPreview")}</div>
          <div className="h-2.5 rounded-full" style={{ background: rampGradient(previewPrefs) }} />
          <div className="flex items-start justify-between gap-2">
            {PREVIEW_STOPS.map((stop) => {
              const amount = rampValueAt(previewPrefs, stop)
              return (
                <div key={stop} className="flex flex-col items-center gap-1.5">
                  <span
                    className="size-3.5 rounded-full"
                    style={{ backgroundColor: radarColorFor(amount, previewPrefs) }}
                  />
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {formatNumberValue(amount, undefined, monetary)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {carga === "falhou" && (
          <p className="text-sm text-destructive">{t("radarLoadError")}</p>
        )}

        <Button
          type="button"
          className="cursor-pointer"
          onClick={handleSave}
          disabled={saving || carga !== "pronto" || !validation.ok}
        >
          {saving ? t("radarSaving") : t("radarSave")}
        </Button>
      </CardContent>
    </Card>
  )
}
