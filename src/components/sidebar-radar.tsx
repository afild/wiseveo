"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import { useSidebar } from "@/components/ui/sidebar"
import { useMonetaryFormattingSafe } from "@/hooks/use-monetary-formatting"
import { createDateFormatter } from "@/i18n/format"
import { radarColorFor, RADAR_NEUTRAL } from "@/features/radar/lib/radar-color"
import {
  defaultRadarPreferences,
  resolveRadarPreferences,
  type RadarPreferences,
} from "@/features/radar/lib/radar-preferences"

interface RadarLookahead {
  worstDate: string
  worstBalance: number
  horizonDate: string
  horizonDays: number
  requestedDays: number
  truncated: boolean
}

interface RadarPayload {
  preferences: RadarPreferences
  todayBalance: number | null
  monthEndBalance: number | null
  lookahead: RadarLookahead | null
}

/** Vazado quando o horizonte real cobre menos da metade da janela pedida. */
function horizonIsShort(lookahead: RadarLookahead | null): boolean {
  if (!lookahead) return false
  return lookahead.horizonDays * 2 < lookahead.requestedDays
}

export function SidebarRadar() {
  const { state } = useSidebar()
  const collapsed = state === "collapsed"
  const t = useTranslations("common.sidebarRadar")
  const locale = useLocale()
  const monetary = useMonetaryFormattingSafe()

  const [payload, setPayload] = React.useState<RadarPayload | null>(null)

  React.useEffect(() => {
    let active = true
    const controller = new AbortController()

    async function fetchData() {
      try {
        const res = await fetch("/api/dashboard/radar", {
          cache: "no-store",
          signal: controller.signal,
        })
        if (!res.ok) return
        const json = await res.json()
        if (!active) return
        setPayload({
          preferences: resolveRadarPreferences(json.preferences),
          todayBalance: typeof json.todayBalance === "number" ? json.todayBalance : null,
          monthEndBalance:
            typeof json.monthEndBalance === "number" ? json.monthEndBalance : null,
          lookahead: json.lookahead ?? null,
        })
      } catch {
        // Rede fora do ar ou pedido cancelado: o ponto fica neutro.
      }
    }

    fetchData()
    const handleFocus = () => fetchData()
    window.addEventListener("focus", handleFocus)

    return () => {
      active = false
      controller.abort()
      window.removeEventListener("focus", handleFocus)
    }
  }, [])

  const preferences = payload?.preferences ?? defaultRadarPreferences
  const todayBalance = payload?.todayBalance ?? null
  const monthEndBalance = payload?.monthEndBalance ?? null
  const lookahead = payload?.lookahead ?? null

  // Enquanto nada chegou, o ponto fica neutro em vez de julgar pelo padrão e trocar de cor
  // depois da hidratação.
  const measured =
    payload === null
      ? null
      : preferences.mode === "today"
        ? todayBalance
        : (lookahead?.worstBalance ?? todayBalance)

  const color = payload === null ? RADAR_NEUTRAL : radarColorFor(measured, preferences)
  const hollow =
    payload !== null &&
    preferences.mode === "lookahead" &&
    (lookahead === null || horizonIsShort(lookahead))

  // `createDateFormatter` devolve um Intl.DateTimeFormat, então o uso é `.format(data)`.
  // As chaves vêm em UTC e o formatador precisa ler em UTC, senão a oeste de Greenwich
  // "2026-09-12" aparece como dia 11.
  const dayFormatter = React.useMemo(
    () => createDateFormatter(locale, { day: "2-digit", month: "short", timeZone: "UTC" }),
    [locale],
  )
  const formatKey = React.useCallback(
    (key: string) => {
      const [year, month, day] = key.split("-").map(Number)
      return dayFormatter.format(new Date(Date.UTC(year, month - 1, day)))
    },
    [dayFormatter],
  )

  const dash = "---"
  const todayText = todayBalance !== null ? monetary.formatMonetaryValue(todayBalance) : dash
  const projectedText =
    monthEndBalance !== null ? monetary.formatMonetaryValue(monthEndBalance) : dash

  let reason: string
  if (preferences.mode === "today") {
    reason = t("tooltipToday")
  } else if (lookahead === null) {
    reason = t("tooltipNoData")
  } else if (horizonIsShort(lookahead)) {
    reason = t("tooltipHorizonShort", { horizon: formatKey(lookahead.horizonDate) })
  } else {
    reason = t("tooltipWorst", {
      date: formatKey(lookahead.worstDate),
      value: monetary.formatMonetaryValue(lookahead.worstBalance),
      horizon: formatKey(lookahead.horizonDate),
    })
  }

  const tooltip = `${t("tooltipCollapsed", { today: todayText, projected: projectedText })}\n${reason}`

  return (
    <div
      className={`relative flex min-h-[80px] items-center border-b border-sidebar-border transition-all duration-200 ${
        collapsed ? "justify-center py-4" : "justify-between px-4 py-4"
      } mb-4`}
    >
      {!collapsed && (
        <div className="flex flex-col gap-1 overflow-hidden">
          <span className="text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/60">
            {t("currentBalance")}
          </span>
          <span className="font-display truncate text-2xl font-bold text-primary">
            {todayBalance !== null ? monetary.formatNumberValue(todayBalance) : dash}
          </span>
          <span className="truncate text-[11px] text-sidebar-foreground/60">
            {t("projected")}{" "}
            {monthEndBalance !== null ? monetary.formatNumberValue(monthEndBalance) : dash}
          </span>
        </div>
      )}

      <div
        className={`status-radar w-3 h-3 min-w-3 min-h-3 shrink-0${hollow ? " is-hollow" : ""}`}
        style={{ color }}
        title={tooltip}
      >
        <div className="ring" />
      </div>
    </div>
  )
}
