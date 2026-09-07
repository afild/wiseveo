"use client"

import * as React from "react"
import { format } from "date-fns"
import {
  Area,
  AreaChart,
  Bar,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts"
import { BarChart3, LineChart as LineChartIcon } from "lucide-react"

import {
  CardAction,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart"
import { useDateRange } from "@/contexts/date-range-context"
import { useMonetaryFormattingSafe } from "@/hooks/use-monetary-formatting"
import { useDeviceClass } from "@/hooks/use-device-class"
import { normalizeDate } from "@/lib/financial"
import { cn } from "@/lib/utils"
import { useLocale, useTranslations } from "next-intl"
import { createDateFormatter } from "@/i18n/format"

interface CashflowPoint {
  date: string
  income: number
  expense: number
  balance: number
}

// Séries que o tooltip mostra. Os nomes precisam bater com as chaves do ChartConfig
// e com o `name` de cada Area/Bar: o ChartContainer injeta `--color-<chave>` a partir
// delas, e o tooltip pinta rótulo e bolinha com essa mesma variável para nunca
// divergir da cor da linha/barra (inclusive ao trocar tema ou preset).
const TOOLTIP_SERIES = ["income", "expense", "balance"] as const
type TooltipSeriesKey = (typeof TOOLTIP_SERIES)[number]

function isTooltipSeriesKey(key: string): key is TooltipSeriesKey {
  return (TOOLTIP_SERIES as readonly string[]).includes(key)
}

function formatDateLabel(dateIso: string, locale: string) {
  const date = normalizeDate(dateIso)
  return createDateFormatter(locale, {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(date)
}

function formatTooltipTitle(value: unknown, locale: string) {
  if (typeof value !== "string") return "—"

  const normalized = normalizeDate(value.trim())
  if (Number.isNaN(normalized.getTime())) return "—"

  return createDateFormatter(locale, { timeZone: "UTC" }).format(normalized)
}

interface TrialTooltipPayloadItem {
  name?: unknown
  value?: unknown
}

interface TrialTooltipContentProps {
  active?: boolean
  label?: unknown
  payload?: TrialTooltipPayloadItem[]
}

interface BalanceDotProps {
  cx?: number
  cy?: number
  payload?: { balance?: number }
}

function renderNegativeBalanceDot({ cx, cy, payload }: BalanceDotProps) {
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null

  const balance = Number(payload?.balance ?? 0)
  if (!Number.isFinite(balance) || balance >= 0) return null

  return (
    <circle
      cx={cx}
      cy={cy}
      r={3.5}
      fill="var(--destructive)"
      stroke="var(--background)"
      strokeWidth={1.5}
    />
  )
}

function TrialTooltipContent({ active, label, payload }: TrialTooltipContentProps) {
  const monetary = useMonetaryFormattingSafe()
  const t = useTranslations("dashboard.SectionCards")
  const locale = useLocale()

  if (!active || !payload?.length) return null

  const rows: Array<{
    key: TooltipSeriesKey
    value: number
  }> = []

  for (const item of payload) {
    const key = typeof item.name === "string" ? item.name : ""
    if (!isTooltipSeriesKey(key)) continue

    const parsedValue = Number(item.value ?? 0)
    if (!Number.isFinite(parsedValue)) continue

    rows.push({
      key,
      value: key === "balance" ? parsedValue : Math.abs(parsedValue),
    })
  }

  if (!rows.length) return null

  return (
    <div className="border-border/50 bg-background/75 text-card-foreground grid min-w-[220px] items-start gap-1.5 rounded-xl border px-3 py-2 text-xs shadow-xl backdrop-blur-md">
      <p className="text-foreground font-medium">{formatTooltipTitle(label, locale)}</p>
      <div className="mt-1.5 grid gap-1.5">
        {rows.map((row) => {
          // Mesma variável que a série usa no gráfico (não usar item.color do Recharts:
          // o saldo é um gradiente url(#...), que não é uma cor CSS válida).
          const colorVar = `var(--color-${row.key})`

          return (
            <div
              key={row.key}
              className={cn(
                "flex w-full items-center justify-between gap-2 leading-none",
                row.key === "balance" && "mt-1 border-t border-border/60 pt-2"
              )}
            >
              <span className="flex items-center gap-2 text-xs font-medium" style={{ color: colorVar }}>
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorVar }} />
                {t(row.key)}:
              </span>
              <span className="text-foreground font-medium tabular-nums">
                {monetary.formatMonetaryValue(row.value)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function buildXTicks(points: CashflowPoint[], isMobile = false) {
  if (!points.length) return []

  const firstIso = points[0].date
  const lastIso = points[points.length - 1].date
  const first = new Date(`${firstIso}T00:00:00Z`)
  const last = new Date(`${lastIso}T00:00:00Z`)
  const sameMonth =
    first.getUTCFullYear() === last.getUTCFullYear() &&
    first.getUTCMonth() === last.getUTCMonth()

  const days =
    Math.floor((last.getTime() - first.getTime()) / (24 * 60 * 60 * 1000)) + 1

  // Mobile + same month: tick every 3 days to avoid crowding on small screens
  if (isMobile && sameMonth && days <= 31) {
    const ticks: string[] = []
    points.forEach((point, i) => {
      const dayNum = new Date(`${point.date}T00:00:00Z`).getUTCDate()
      if (i === 0 || i === points.length - 1 || dayNum % 3 === 0) {
        ticks.push(point.date)
      }
    })
    return ticks
  }

  // Same month: render all days in sequence (1..28/29/30/31).
  if (sameMonth && days <= 31) {
    return points.map((point) => point.date)
  }

  // Up to ~3 months: weekly cadence + bounds.
  if (days <= 93) {
    const picked = new Set<string>([firstIso, lastIso])

    for (let i = 7; i < points.length - 1; i += 7) {
      picked.add(points[i].date)
    }

    return points.filter((point) => picked.has(point.date)).map((point) => point.date)
  }

  // Long ranges: near-monthly cadence + bounds.
  const targetTicks = isMobile ? 5 : 8
  const step = Math.ceil((points.length - 1) / (targetTicks - 1))
  const ticks: string[] = []

  for (let i = 0; i < points.length; i += step) {
    ticks.push(points[i].date)
  }

  const lastTickIso = points[points.length - 1]?.date
  if (lastTickIso && ticks[ticks.length - 1] !== lastTickIso) {
    ticks.push(lastTickIso)
  }

  return ticks
}

function buildYAxis(points: CashflowPoint[]) {
  if (!points.length) {
    return {
      domain: [-500, 500] as [number, number],
      ticks: [-500, -250, 0, 250, 500],
    }
  }

  let min = 0
  let max = 0

  for (const point of points) {
    min = Math.min(min, point.income, point.expense, point.balance)
    max = Math.max(max, point.income, point.expense, point.balance)
  }

  const range = Math.max(max - min, 1)
  const targetTicks = 6
  let step = range / targetTicks

  const magnitude = Math.pow(10, Math.floor(Math.log10(step)))
  const residual = step / magnitude

  if (residual < 1.5) step = 1 * magnitude
  else if (residual < 3) step = 2 * magnitude
  else if (residual < 7) step = 5 * magnitude
  else step = 10 * magnitude

  // Keep readable tick spacing for currency values.
  step = Math.max(step, 100)

  const start = Math.floor(min / step) * step
  const end = Math.ceil(max / step) * step
  const ticks: number[] = []

  for (let value = start; value <= end + step / 2; value += step) {
    ticks.push(Math.round(value))
  }

  return {
    domain: [ticks[0], ticks[ticks.length - 1]] as [number, number],
    ticks,
  }
}

export function ChartAreaInteractive() {
  const monetary = useMonetaryFormattingSafe()
  const { dateRange } = useDateRange()
  const { isMobile } = useDeviceClass()
  const [chartType, setChartType] = React.useState<"area" | "bar">("area")
  const [points, setPoints] = React.useState<CashflowPoint[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  
  const t = useTranslations("dashboard.ChartArea")
  const tSectionCards = useTranslations("dashboard.SectionCards")
  const locale = useLocale()

  const dynamicChartConfig = {
    income: {
      label: tSectionCards("income"),
      color: "var(--chart-2)",
    },
    expense: {
      label: tSectionCards("expense"),
      color: "var(--destructive)",
    },
    balance: {
      label: tSectionCards("balance"),
      color: "var(--primary)",
    },
  } satisfies ChartConfig

  React.useEffect(() => {
    let isCancelled = false

    async function fetchCashflow() {
      setLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams({
          from: format(dateRange.from, "yyyy-MM-dd"),
          to: format(dateRange.to, "yyyy-MM-dd"),
        })

        const res = await fetch(`/api/dashboard/cashflow?${params.toString()}`)

        if (!res.ok) {
          throw new Error(t("fetchError"))
        }

        const payload = (await res.json()) as { points: CashflowPoint[] }
        const normalized = (payload.points ?? []).map((point) => ({
          ...point,
          // Enforce template behavior: income always positive and expense always negative.
          income: Math.abs(point.income ?? 0),
          expense:
            (point.expense ?? 0) === 0 ? 0 : -Math.abs(point.expense ?? 0),
        }))
        if (!isCancelled) {
          setPoints(normalized)
        }
      } catch (err) {
        console.error("Failed to fetch trial cashflow chart:", err)
        if (!isCancelled) {
          setError(t("loadError"))
        }
      } finally {
        if (!isCancelled) {
          setLoading(false)
        }
      }
    }

    fetchCashflow()

    return () => {
      isCancelled = true
    }
  }, [dateRange.from, dateRange.to, t])

  const yAxis = React.useMemo(() => buildYAxis(points), [points])
  const xTicks = React.useMemo(() => buildXTicks(points, isMobile), [points, isMobile])
  const currentBalance = points[points.length - 1]?.balance ?? 0
  const sameMonth = React.useMemo(() => {
    if (!points.length) return true
    const first = new Date(`${points[0].date}T00:00:00Z`)
    const last = new Date(`${points[points.length - 1].date}T00:00:00Z`)
    return (
      first.getUTCFullYear() === last.getUTCFullYear() &&
      first.getUTCMonth() === last.getUTCMonth()
    )
  }, [points])

  return (
    <Card className="@container/card bg-gradient-to-t from-primary/5 to-card shadow-xs dark:bg-card">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>
          {t("description")}
        </CardDescription>
        <CardAction className="mr-3">
          <div className="inline-flex items-center rounded-md border p-1">
            <button
              type="button"
              className={`rounded-sm p-1.5 transition-colors ${chartType === "area"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
                }`}
              onClick={() => setChartType("area")}
            >
              <LineChartIcon className="size-4" />
            </button>
            <button
              type="button"
              className={`rounded-sm p-1.5 transition-colors ${chartType === "bar"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
                }`}
              onClick={() => setChartType("bar")}
            >
              <BarChart3 className="size-4" />
            </button>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t("currentBalance")}{" "}
          <span className="tabular-nums text-foreground">
            {monetary.formatMonetaryValue(currentBalance)}
          </span>
        </p>

        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : (
          <ChartContainer
            config={dynamicChartConfig}
            className={cn(
              "aspect-auto w-full",
              // Shorter chart on mobile to leave room for content below
              isMobile ? "h-[200px]" : "h-[280px]"
            )}
          >
            {chartType === "area" ? (
              <AreaChart
                data={points}
                margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
              >
                <defs>
                  <linearGradient id="fillIncomeTrial" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-income)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="var(--color-income)" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="fillExpenseTrial" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-expense)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="var(--color-expense)" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="fillBalanceTrial" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-balance)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="var(--color-balance)" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="strokeBalanceTrial" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-balance)" stopOpacity={0.95} />
                    <stop offset="95%" stopColor="var(--color-balance)" stopOpacity={0.45} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  ticks={xTicks}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={sameMonth ? 0 : 28}
                  interval={sameMonth ? 0 : "preserveStartEnd"}
                  tickFormatter={(value) =>
                    sameMonth
                      ? new Date(`${value}T00:00:00Z`)
                        .getUTCDate()
                        .toString()
                      : formatDateLabel(value, locale)
                  }
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  domain={yAxis.domain}
                  ticks={yAxis.ticks}
                  tickFormatter={(value) => monetary.formatCompactValue(Number(value ?? 0))}
                  width={isMobile ? 36 : 44}
                />
                <ChartTooltip
                  cursor={false}
                  content={<TrialTooltipContent />}
                />
                <Area
                  type="natural"
                  dataKey="income"
                  name="income"
                  stroke="var(--color-income)"
                  fill="url(#fillIncomeTrial)"
                  fillOpacity={1}
                  dot={false}
                  connectNulls
                  isAnimationActive={!loading}
                />
                <Area
                  type="natural"
                  dataKey="expense"
                  name="expense"
                  stroke="var(--color-expense)"
                  fill="url(#fillExpenseTrial)"
                  fillOpacity={1}
                  dot={false}
                  connectNulls
                  isAnimationActive={!loading}
                />
                <Area
                  type="natural"
                  dataKey="balance"
                  name="balance"
                  stroke="url(#strokeBalanceTrial)"
                  fill="url(#fillBalanceTrial)"
                  fillOpacity={1}
                  dot={renderNegativeBalanceDot}
                  connectNulls
                  isAnimationActive={!loading}
                />
              </AreaChart>
            ) : (
                <ComposedChart
                data={points}
                margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
                barCategoryGap="8%"
                stackOffset="sign"
              >
                <defs>
                  <linearGradient id="fillBalanceTrial" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-balance)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="var(--color-balance)" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="strokeBalanceTrial" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-balance)" stopOpacity={0.95} />
                    <stop offset="95%" stopColor="var(--color-balance)" stopOpacity={0.45} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  ticks={xTicks}
                  padding="no-gap"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={sameMonth ? 0 : 28}
                  interval={sameMonth ? 0 : "preserveStartEnd"}
                  tickFormatter={(value) =>
                    sameMonth
                      ? new Date(`${value}T00:00:00Z`)
                        .getUTCDate()
                        .toString()
                      : formatDateLabel(value, locale)
                  }
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  domain={yAxis.domain}
                  ticks={yAxis.ticks}
                  tickFormatter={(value) => monetary.formatCompactValue(Number(value ?? 0))}
                  width={isMobile ? 36 : 44}
                />
                <ChartTooltip
                  cursor={false}
                  content={<TrialTooltipContent />}
                />
                <Bar
                  dataKey="income"
                  name="income"
                  stackId="cashflow"
                  radius={3}
                  fill="var(--color-income)"
                  fillOpacity={0.22}
                  stroke="var(--color-income)"
                  strokeOpacity={0.4}
                />
                <Bar
                  dataKey="expense"
                  name="expense"
                  stackId="cashflow"
                  radius={3}
                  fill="var(--color-expense)"
                  fillOpacity={0.22}
                  stroke="var(--color-expense)"
                  strokeOpacity={0.4}
                />
                <Area
                  type="natural"
                  dataKey="balance"
                  name="balance"
                  stroke="url(#strokeBalanceTrial)"
                  fill="url(#fillBalanceTrial)"
                  fillOpacity={1}
                  dot={renderNegativeBalanceDot}
                  connectNulls
                  isAnimationActive={!loading}
                />
              </ComposedChart>
            )}
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
