"use client"

import * as React from "react"
import { format } from "date-fns"
import { useTranslations } from "next-intl"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useDateRange } from "@/contexts/date-range-context"
import { useMonetaryFormattingSafe } from "@/hooks/use-monetary-formatting"
import { useDeviceClass } from "@/hooks/use-device-class"

interface ExpenseGroupItem {
  groupCode: string
  groupName: string
  amount: number
  paid: number
  scheduled: number
  percentage: number
}

interface ExpenseRow extends ExpenseGroupItem {
  /** Bucket sintético gerado pela API (transferências, sem grupo, agregado do
   *  top-5) — recebe cinza neutro em vez de um token categórico do tema. */
  isSyntheticBucket: boolean
  color: string
}

// Paleta categórica do tema ativo: todos os presets da galeria definem
// exatamente estes 5 slots. Ordem fixa, nunca ciclada — a API limita a
// 5 grupos reais + 1 bucket neutro, então nunca falta token.
const CHART_TOKENS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

const NEUTRAL_TOKEN = "var(--muted-foreground)"

// Códigos que a rota usa para buckets que não são grupos do plano de contas.
const SYNTHETIC_GROUP_CODES = new Set(["others", "-1", "0"])

function buildRows(groups: ExpenseGroupItem[]): ExpenseRow[] {
  let tokenIdx = 0

  return groups.map((g) => {
    const isSyntheticBucket = SYNTHETIC_GROUP_CODES.has(g.groupCode)
    const color = isSyntheticBucket
      ? NEUTRAL_TOKEN
      : CHART_TOKENS[Math.min(tokenIdx++, CHART_TOKENS.length - 1)]

    return { ...g, isSyntheticBucket, color }
  })
}

interface GroupBarRowProps {
  row: ExpenseRow
  maxAmount: number
  index: number
  mounted: boolean
}

function GroupBarRow({ row, maxAmount, index, mounted }: GroupBarRowProps) {
  const monetary = useMonetaryFormattingSafe()
  const t = useTranslations("dashboard.ExpensesChart")

  const widthPct = maxAmount > 0 ? (row.amount / maxAmount) * 100 : 0
  const paidGrow = row.amount > 0 ? row.paid / row.amount : 0
  const scheduledGrow = row.amount > 0 ? row.scheduled / row.amount : 0

  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <div className="group space-y-1.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50" tabIndex={0}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-xs font-medium text-foreground">
              {row.groupName}
            </span>
            <span className="flex shrink-0 items-baseline gap-2 text-xs tabular-nums">
              <span className="font-medium text-foreground">
                {monetary.formatMonetaryValue(Math.abs(row.amount))}
              </span>
              <span className="w-10 text-right text-muted-foreground">
                {row.percentage.toFixed(1)}%
              </span>
            </span>
          </div>

          <div className="h-2 w-full rounded-full bg-muted/60">
            <div
              className="flex h-full gap-[2px] overflow-hidden rounded-full transition-[width] duration-1000"
              style={{
                width: mounted ? `${widthPct}%` : "0%",
                transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
                transitionDelay: `${index * 60}ms`,
              }}
            >
              {row.paid > 0 && (
                <div
                  className="h-full min-w-[3px] rounded-full"
                  style={{ backgroundColor: row.color, flexGrow: paidGrow }}
                />
              )}
              {row.scheduled > 0 && (
                <div
                  className="h-full min-w-[3px] rounded-full opacity-35"
                  style={{ backgroundColor: row.color, flexGrow: scheduledGrow }}
                />
              )}
            </div>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" className="min-w-[200px]">
        <div className="grid gap-1.5 text-xs">
          <div className="mb-1 flex items-center justify-between gap-2 border-b border-border/50 pb-1">
            <p className="font-semibold">{row.groupName}</p>
            <span className="font-medium text-muted-foreground">
              {row.percentage.toFixed(1)}%
            </span>
          </div>

          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: row.color }}
              />
              {t("paid")}
            </span>
            <span className="font-medium tabular-nums">
              {monetary.formatMonetaryValue(row.paid)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span
                className="size-2 shrink-0 rounded-full opacity-35"
                style={{ backgroundColor: row.color }}
              />
              {t("toPay")}
            </span>
            <span className="font-medium tabular-nums">
              {monetary.formatMonetaryValue(row.scheduled)}
            </span>
          </div>

          <div className="mt-0.5 flex items-center justify-between gap-4 border-t border-border/50 pt-1">
            <span className="font-medium">{t("total")}</span>
            <span className="font-bold tabular-nums">
              {monetary.formatMonetaryValue(row.amount)}
            </span>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

export function ExpensesByGroupChart() {
  const monetary = useMonetaryFormattingSafe()
  const { dateRange } = useDateRange()
  const { isMobile } = useDeviceClass()
  const [rows, setRows] = React.useState<ExpenseRow[]>([])
  const [totalExpense, setTotalExpense] = React.useState(0)
  const [loading, setLoading] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)

  const t = useTranslations("dashboard.ExpensesChart")

  const minHeight = isMobile ? 200 : 280

  React.useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50)
    return () => clearTimeout(timer)
  }, [])

  React.useEffect(() => {
    let isCancelled = false

    async function fetchData() {
      setLoading(true)

      try {
        const params = new URLSearchParams({
          from: format(dateRange.from, "yyyy-MM-dd"),
          to: format(dateRange.to, "yyyy-MM-dd"),
        })

        const res = await fetch(
          `/api/dashboard/expenses-by-group?${params.toString()}`,
        )

        if (!res.ok) throw new Error("Falha ao carregar despesas por grupo") // i18n-ignore: mensagem interna de Error, só logada (console.error), nunca exibida ao usuário

        const payload = (await res.json()) as {
          groups: ExpenseGroupItem[]
          totalExpense: number
        }

        if (!isCancelled) {
          setRows(buildRows(payload.groups))
          setTotalExpense(payload.totalExpense)
        }
      } catch (err) {
        console.error("Failed to fetch expenses by group:", err)
        if (!isCancelled) {
          setRows([])
          setTotalExpense(0)
        }
      } finally {
        if (!isCancelled) setLoading(false)
      }
    }

    fetchData()
    return () => {
      isCancelled = true
    }
  }, [dateRange.from, dateRange.to])

  const maxAmount = rows.length > 0 ? Math.max(...rows.map((r) => r.amount)) : 0

  return (
    <Card className="@container/card h-full bg-gradient-to-t from-primary/5 to-card shadow-xs dark:bg-card">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="text-sm text-muted-foreground">
            {t("totalExpenses")}{" "}
            <span className="tabular-nums text-destructive">
              {monetary.formatMonetaryValue(Math.abs(totalExpense))}
            </span>
          </p>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-muted-foreground" />
              {t("paid")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-muted-foreground opacity-35" />
              {t("toPay")}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center" style={{ height: minHeight }}>
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center" style={{ height: minHeight }}>
            <p className="text-sm text-muted-foreground">{t("noExpenses")}</p>
          </div>
        ) : (
          <TooltipProvider>
            <div className="space-y-4">
              {rows.map((row, index) => (
                <GroupBarRow
                  key={row.groupCode}
                  row={row}
                  maxAmount={maxAmount}
                  index={index}
                  mounted={mounted}
                />
              ))}
            </div>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  )
}
