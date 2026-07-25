"use client"

import * as React from "react"
import { format } from "date-fns"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"

import { useDateRange } from "@/contexts/date-range-context"
import { useMonetaryFormattingSafe } from "@/hooks/use-monetary-formatting"
import { cn } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

interface UpcomingTransactionItem {
  id: string
  title: string
  categoryName: string
  groupName: string
  date: string
  amount: number
}

const PAYMENT_ROW_HEIGHT_PX = 56

function formatShortDate(isoDate: string, locale: string): string {
  const [year, month, day] = isoDate.split("-")
  if (!year || !month || !day) return isoDate

  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0))
  return createDateFormatter(locale, { day: "2-digit", month: "short", timeZone: "UTC" })
    .format(date)
    .replace(".", "")
}

function amountColorClass(value: number): string {
  if (value < 0) return "text-destructive"
  if (value > 0) return "text-positive"
  return "text-foreground"
}

import { useLocale, useTranslations } from "next-intl"
import { createDateFormatter } from "@/i18n/format"

export function UpcomingTransactionsCard() {
  const monetary = useMonetaryFormattingSafe()
  const { dateRange } = useDateRange()
  const [items, setItems] = React.useState<UpcomingTransactionItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [visibleRows, setVisibleRows] = React.useState(0)
  const listViewportRef = React.useRef<HTMLDivElement | null>(null)
  const measureRowRef = React.useRef<HTMLDivElement | null>(null)

  const t = useTranslations("dashboard.UpcomingTransactions")
  const locale = useLocale()

  const recalcVisibleRows = React.useCallback(() => {
    const viewport = listViewportRef.current
    const row = measureRowRef.current
    if (!viewport || !row) return

    const viewportHeight = viewport.getBoundingClientRect().height
    const rowHeight = row.getBoundingClientRect().height || PAYMENT_ROW_HEIGHT_PX
    if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
      setVisibleRows(0)
      return
    }

    const maxRows = Math.max(0, Math.floor(viewportHeight / rowHeight))
    setVisibleRows(maxRows)
  }, [])

  React.useEffect(() => {
    let isCancelled = false

    async function fetchUpcomingTransactions() {
      setLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams({
          from: format(dateRange.from, "yyyy-MM-dd"),
          to: format(dateRange.to, "yyyy-MM-dd"),
        })

        const res = await fetch(`/api/dashboard/upcoming-transactions?${params.toString()}`)
        if (!res.ok) {
          throw new Error("error") // Handled below
        }

        const payload = (await res.json()) as { items: UpcomingTransactionItem[] }
        if (!isCancelled) {
          setItems(payload.items ?? [])
        }
      } catch (err) {
        console.error("Failed to fetch upcoming transactions:", err)
        if (!isCancelled) {
          setItems([])
          setError(t("loadError"))
        }
      } finally {
        if (!isCancelled) {
          setLoading(false)
        }
      }
    }

    fetchUpcomingTransactions()

    return () => {
      isCancelled = true
    }
  }, [dateRange.from, dateRange.to, t])

  React.useEffect(() => {
    recalcVisibleRows()

    const viewport = listViewportRef.current
    const row = measureRowRef.current
    if (!viewport || !row) return

    const observer = new ResizeObserver(() => {
      recalcVisibleRows()
    })

    observer.observe(viewport)
    observer.observe(row)

    return () => {
      observer.disconnect()
    }
  }, [items.length, recalcVisibleRows])

  const visibleItems = items.slice(0, visibleRows)

  return (
    <Card className="@container/card h-full min-h-0 overflow-hidden bg-gradient-to-t from-primary/5 to-card shadow-xs dark:bg-card flex flex-col">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>
          {t("description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 overflow-hidden p-0 font-sans">
        {error ? (
          <div className="mx-4 mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div ref={listViewportRef} className="relative h-full overflow-hidden">
          <div
            ref={measureRowRef}
            className="invisible pointer-events-none absolute left-0 top-0 grid h-12 w-full grid-cols-[auto_minmax(0,1fr)_auto] md:h-14 md:grid-cols-[auto_minmax(0,1fr)_minmax(100px,1fr)_auto] items-center gap-2 border-b px-2 py-3"
            aria-hidden="true"
          >
            <div className="size-7 rounded-md md:size-8" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium uppercase">0</p>
              <p className="truncate text-[9px] leading-tight tracking-tight uppercase text-muted-foreground">0</p>
            </div>
            {/* groupName column — hidden on mobile */}
            <div className="hidden md:flex min-w-0 items-center justify-start text-left">
              <p className="w-full truncate text-left text-[9px] leading-tight tracking-tight uppercase text-muted-foreground">0</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold">0,00</p>
              <p className="text-[9px] leading-tight tracking-tight text-muted-foreground">00 000</p>
            </div>
          </div>

          {loading ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">{t("loading")}</div>
          ) : items.length ? (
            <div className="border-t">
              {visibleItems.map((item) => {
                const negative = item.amount < 0

                return (
                  <div
                    key={item.id}
                    className="grid h-12 md:h-14 grid-cols-[auto_minmax(0,1fr)_auto] md:grid-cols-[auto_minmax(0,1fr)_minmax(100px,1fr)_auto] items-center gap-2 border-b px-2 py-3"
                  >
                    <div
                      className={cn(
                        "flex size-7 md:size-8 shrink-0 items-center justify-center rounded-md",
                        negative ? "bg-destructive/10 text-destructive" : "bg-positive/15 text-positive"
                      )}
                    >
                      {negative ? <ArrowDownRight className="size-3.5 md:size-4" /> : <ArrowUpRight className="size-3.5 md:size-4" />}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium uppercase">{item.title}</p>
                      <p className="truncate text-[9px] leading-tight tracking-tight uppercase text-muted-foreground">{item.categoryName}</p>
                    </div>

                    {/* groupName: visible only on md+ */}
                    <div className="hidden md:flex min-w-0 items-center justify-start text-left">
                      <p className="w-full truncate text-left text-[9px] leading-tight tracking-tight uppercase text-muted-foreground">{item.groupName}</p>
                    </div>

                    <div className="text-right">
                      <p className={cn("text-sm font-semibold", amountColorClass(item.amount))}>
                        {monetary.formatMonetaryValue(item.amount)}
                      </p>
                      <p className="text-[9px] leading-tight tracking-tight text-muted-foreground">{formatShortDate(item.date, locale)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              {t("noTransactions")}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
