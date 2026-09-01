"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { AlertTriangle, BellRing, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { createDateFormatter } from "@/i18n/format"
import {
  defaultNotificationPreferences,
  MAX_BILLS_DAYS_AHEAD,
  MAX_MONTHLY_DAY,
  resolveNotificationPreferences,
  type NotificationPreferences,
} from "@/features/notifications/lib/preferences"

/**
 * Configurações → Avisos. É a tela de CADA PESSOA: o bot é da casa, mas o que
 * chega no Telegram de quem é quem escolhe aqui.
 *
 * Tudo nasce desligado. Ligar um aviso sem o Telegram conectado (ou antes de o
 * dono preparar o banco) não quebra nada — a tela avisa que ainda não vai chegar.
 */

interface NotificationsFormProps {
  initialPreferences: NotificationPreferences
  initialTelegramConnected: boolean
  initialLedgerReady: boolean
  /** Demo ilustrativa: os controles mexem só na tela e o salvar não grava. */
  demoMode?: boolean
}

/** Horários de meia em meia hora: 48 opções cobrem qualquer rotina sem virar lista infinita. */
const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hour = String(Math.floor(index / 2)).padStart(2, "0")
  const minute = index % 2 === 0 ? "00" : "30"
  return `${hour}:${minute}`
})

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6]
const MONTH_DAYS = Array.from({ length: MAX_MONTHLY_DAY }, (_, index) => index + 1)
const DAYS_AHEAD = Array.from({ length: MAX_BILLS_DAYS_AHEAD }, (_, index) => index + 1)

/**
 * "HH:MM" vira o relógio do idioma da tela (24h em pt-BR e es-419, AM/PM em
 * en-US) pelo próprio motor de datas — em vez de uma regra escrita à mão, que
 * seria mais uma lista para atualizar a cada idioma novo. A data de referência é
 * montada e lida em UTC: só as horas importam.
 */
function timeOptionLabel(value: string, formatter: Intl.DateTimeFormat): string {
  const [hour, minute] = value.split(":").map(Number)
  return formatter.format(new Date(Date.UTC(2024, 0, 1, hour, minute)))
}

/**
 * A lista de fusos do próprio navegador, com "UTC" garantido na frente.
 *
 * O navegador NÃO devolve "UTC" na lista (só as zonas de cidade), e "UTC" é o
 * padrão de quem nunca salvou: sem acrescentá-lo, o campo abriria em branco e
 * pareceria que ninguém escolheu nada. O fuso já salvo também entra, caso um
 * navegador mais antigo não o conheça — melhor mostrá-lo que apagá-lo em silêncio.
 */
function listTimeZones(current: string): string[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
    .supportedValuesOf
  let zones: string[] = []
  try {
    zones = supported?.("timeZone") ?? []
  } catch {
    zones = []
  }
  return [...new Set(["UTC", current, ...zones].filter(Boolean))]
}

function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

export function NotificationsForm({
  initialPreferences,
  initialTelegramConnected,
  initialLedgerReady,
  demoMode = false,
}: NotificationsFormProps) {
  const t = useTranslations("settings.notifications")
  const tCommon = useTranslations("common")
  const tShowcase = useTranslations("demo.showcase")
  const locale = useLocale()

  const [preferences, setPreferences] = React.useState(initialPreferences)
  const [telegramConnected] = React.useState(initialTelegramConnected)
  const [ledgerReady] = React.useState(initialLedgerReady)
  const [saving, setSaving] = React.useState(false)

  const timeZones = React.useMemo(
    () => listTimeZones(preferences.timezone),
    [preferences.timezone],
  )
  // Quem nunca salvou está em "UTC" (o padrão). O fuso do aparelho entra por
  // BOTÃO, não sozinho: preencher em silêncio no primeiro desenho brigaria com
  // o que o servidor já mandou pronto — e mexer na preferência de alguém sem
  // pedir é justamente o que esta tela não faz.
  const zoneIsDefault = preferences.timezone === defaultNotificationPreferences.timezone

  const timeFormatter = React.useMemo(
    () => createDateFormatter(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }),
    [locale],
  )

  const weekdayNames = React.useMemo(() => {
    // Nomes dos dias vêm do próprio motor de datas, no idioma da tela: são dados
    // de calendário, não texto de produto para traduzir à mão.
    //
    // `timeZone: "UTC"` é obrigatório: as datas de referência são montadas em UTC
    // e, sem isto, um navegador a oeste de Greenwich recuaria um dia e a lista
    // sairia toda deslocada — "segunda" apareceria escrito "domingo".
    const formatter = createDateFormatter(locale, { weekday: "long", timeZone: "UTC" })
    return WEEKDAYS.map((weekday) =>
      formatter.format(new Date(Date.UTC(2024, 0, 7 + weekday))),
    )
  }, [locale])

  function update(patch: Partial<NotificationPreferences>) {
    setPreferences((current) => ({ ...current, ...patch }))
  }

  async function save() {
    if (demoMode) {
      toast.info(tShowcase("saveNotice"))
      return
    }
    setSaving(true)
    try {
      const response = await fetch("/api/user/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preferences),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) throw new Error(payload?.message ?? t("error"))
      setPreferences(resolveNotificationPreferences(payload.data.preferences))
      toast.success(t("saved"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("error"))
    } finally {
      setSaving(false)
    }
  }

  function renderTimeSelect(value: string, onChange: (next: string) => void, label: string) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="w-[130px] cursor-pointer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_OPTIONS.map((option) => (
              <SelectItem key={option} value={option} className="cursor-pointer">
                {timeOptionLabel(option, timeFormatter)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="size-4" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("desc")}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {!telegramConnected && (
          <p className="flex items-start gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {t("telegramMissing")}
          </p>
        )}

        {!ledgerReady && (
          <p className="flex items-start gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {t("databaseMissing")}
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <Label>{t("timezone")}</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select
              value={preferences.timezone}
              onValueChange={(timezone) => update({ timezone })}
            >
              <SelectTrigger className="w-full max-w-sm cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {timeZones.map((zone) => (
                  <SelectItem key={zone} value={zone} className="cursor-pointer">
                    {zone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer"
              onClick={() => update({ timezone: detectTimeZone() })}
            >
              {t("useDeviceZone")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {zoneIsDefault ? t("timezoneConfirm") : t("timezoneHelp")}
          </p>
        </div>

        <Separator />

        <div className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-start gap-3">
              <Switch
                checked={preferences.dailyDigest.enabled}
                onCheckedChange={(enabled) =>
                  update({ dailyDigest: { ...preferences.dailyDigest, enabled } })
                }
                className="mt-1 cursor-pointer"
              />
              <div>
                <p className="font-medium">{t("daily.title")}</p>
                <p className="text-sm text-muted-foreground">{t("daily.desc")}</p>
              </div>
            </div>
            {renderTimeSelect(
              preferences.dailyDigest.time,
              (time) => update({ dailyDigest: { ...preferences.dailyDigest, time } }),
              t("at"),
            )}
          </div>

          <Separator />

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-start gap-3">
              <Switch
                checked={preferences.weeklyDigest.enabled}
                onCheckedChange={(enabled) =>
                  update({ weeklyDigest: { ...preferences.weeklyDigest, enabled } })
                }
                className="mt-1 cursor-pointer"
              />
              <div>
                <p className="font-medium">{t("weekly.title")}</p>
                <p className="text-sm text-muted-foreground">{t("weekly.desc")}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">{t("weekly.weekday")}</Label>
                <Select
                  value={String(preferences.weeklyDigest.weekday)}
                  onValueChange={(value) =>
                    update({ weeklyDigest: { ...preferences.weeklyDigest, weekday: Number(value) } })
                  }
                >
                  <SelectTrigger className="w-[150px] cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS.map((weekday) => (
                      <SelectItem key={weekday} value={String(weekday)} className="cursor-pointer">
                        {weekdayNames[weekday]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {renderTimeSelect(
                preferences.weeklyDigest.time,
                (time) => update({ weeklyDigest: { ...preferences.weeklyDigest, time } }),
                t("at"),
              )}
            </div>
          </div>

          <Separator />

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-start gap-3">
              <Switch
                checked={preferences.monthlyDigest.enabled}
                onCheckedChange={(enabled) =>
                  update({ monthlyDigest: { ...preferences.monthlyDigest, enabled } })
                }
                className="mt-1 cursor-pointer"
              />
              <div>
                <p className="font-medium">{t("monthly.title")}</p>
                <p className="text-sm text-muted-foreground">{t("monthly.desc")}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">{t("monthly.day")}</Label>
                <Select
                  value={String(preferences.monthlyDigest.day)}
                  onValueChange={(value) =>
                    update({ monthlyDigest: { ...preferences.monthlyDigest, day: Number(value) } })
                  }
                >
                  <SelectTrigger className="w-[110px] cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {MONTH_DAYS.map((day) => (
                      <SelectItem key={day} value={String(day)} className="cursor-pointer">
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {renderTimeSelect(
                preferences.monthlyDigest.time,
                (time) => update({ monthlyDigest: { ...preferences.monthlyDigest, time } }),
                t("at"),
              )}
            </div>
          </div>

          <Separator />

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-start gap-3">
              <Switch
                checked={preferences.sentinel.enabled}
                onCheckedChange={(enabled) =>
                  update({ sentinel: { ...preferences.sentinel, enabled } })
                }
                className="mt-1 cursor-pointer"
              />
              <div>
                <p className="font-medium">{t("sentinel.title")}</p>
                <p className="text-sm text-muted-foreground">{t("sentinel.desc")}</p>
              </div>
            </div>
            {renderTimeSelect(
              preferences.sentinel.time,
              (time) => update({ sentinel: { ...preferences.sentinel, time } }),
              t("at"),
            )}
          </div>

          <Separator />

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-start gap-3">
              <Switch
                checked={preferences.billsReminder.enabled}
                onCheckedChange={(enabled) =>
                  update({ billsReminder: { ...preferences.billsReminder, enabled } })
                }
                className="mt-1 cursor-pointer"
              />
              <div>
                <p className="font-medium">{t("bills.title")}</p>
                <p className="text-sm text-muted-foreground">{t("bills.desc")}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">{t("bills.daysAhead")}</Label>
                <Select
                  value={String(preferences.billsReminder.daysAhead)}
                  onValueChange={(value) =>
                    update({
                      billsReminder: { ...preferences.billsReminder, daysAhead: Number(value) },
                    })
                  }
                >
                  <SelectTrigger className="w-[110px] cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {DAYS_AHEAD.map((days) => (
                      <SelectItem key={days} value={String(days)} className="cursor-pointer">
                        {days}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {renderTimeSelect(
                preferences.billsReminder.time,
                (time) => update({ billsReminder: { ...preferences.billsReminder, time } }),
                t("at"),
              )}
            </div>
          </div>
        </div>

        <Button type="button" className="cursor-pointer" disabled={saving} onClick={save}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          {saving ? t("saving") : tCommon("save")}
        </Button>
      </CardContent>
    </Card>
  )
}
