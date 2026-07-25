"use client"

import * as React from "react"
import { format } from "date-fns"

import { useDateRange } from "@/contexts/date-range-context"
import { useMonetaryFormattingSafe } from "@/hooks/use-monetary-formatting"
import { useDeviceClass } from "@/hooks/use-device-class"
import { cn } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { useTranslations } from "next-intl"

interface DailyMovementRow {
  date: string
  income: number
  expense: number
  net: number
  accumulated: number
}

/** Full date on desktop: dd/MM/yyyy. Short on mobile: dd/MM */
function formatDate(isoDate: string, short = false): string {
  const [year, month, day] = isoDate.split("-")
  if (!year || !month || !day) return isoDate
  return short ? `${day}/${month}` : `${day}/${month}/${year}`
}

export function DailyMovementCard() {
  const monetary = useMonetaryFormattingSafe()
  const { dateRange } = useDateRange()
  const { isMobile } = useDeviceClass()
  const [rows, setRows] = React.useState<DailyMovementRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  
  const t = useTranslations("dashboard.DailyMovement")

  React.useEffect(() => {
    let isCancelled = false

    async function fetchDailyMovement() {
      setLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams({
          from: format(dateRange.from, "yyyy-MM-dd"),
          to: format(dateRange.to, "yyyy-MM-dd"),
        })

        const res = await fetch(`/api/dashboard/daily-movement?${params.toString()}`)

        if (!res.ok) {
          throw new Error("error") // Handled below
        }

        const payload = (await res.json()) as { rows: DailyMovementRow[] }
        if (!isCancelled) {
          setRows(payload.rows ?? [])
        }
      } catch (err) {
        console.error("Failed to fetch daily movement:", err)
        if (!isCancelled) {
          setRows([])
          setError(t("loadError"))
        }
      } finally {
        if (!isCancelled) {
          setLoading(false)
        }
      }
    }

    fetchDailyMovement()

    return () => {
      isCancelled = true
    }
  }, [dateRange.from, dateRange.to, t])

  const totalIncome = rows.reduce((sum, row) => sum + row.income, 0)
  const totalExpense = rows.reduce((sum, row) => sum + row.expense, 0)
  const totalBalance = rows.reduce((sum, row) => sum + row.net, 0)
  const finalAccumulated = rows[rows.length - 1]?.accumulated ?? 0

  // Mobile: always full monetary value format (e.g. "1.234,56")
  const fmtVal = (v: number) => monetary.formatMonetaryValue(v)

  // Cell padding: ultra-tight on mobile, normal on md+
  const cellBase = "px-0.5 py-0.5 md:px-4 md:py-2"
  const cellRight = cn(cellBase, "text-right")
  // Font: 11px on mobile → 14px (text-sm) on md+
  const textSize = "text-[11px] md:text-sm"
  // Header: centered on all breakpoints
  const headBase = cn(cellBase, textSize, "font-bold text-center whitespace-nowrap")

  return (
    <Card className="@container/card bg-gradient-to-t from-primary/5 to-card shadow-xs dark:bg-card">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>
          {t("description")}
        </CardDescription>
      </CardHeader>
      {/* Reduce horizontal padding on mobile so all 5 columns fit */}
      <CardContent className="font-[system-ui] px-2 md:px-6">
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        <Table>
          <TableHeader>
            <TableRow>
              {/* Mobile: +, -, SALDO, ACUM. — max density; all centered
                  Desktop: ENTRADAS, SAÍDAS, SALDO, ACUMULADO */}
              <TableHead className={headBase}>
                {t("date")}
              </TableHead>
              <TableHead className={headBase}>
                {isMobile ? t("mobilePlus") : t("income")}
              </TableHead>
              <TableHead className={headBase}>
                {isMobile ? t("mobileMinus") : t("expense")}
              </TableHead>
              <TableHead className={headBase}>
                {t("balance")}
              </TableHead>
              <TableHead className={headBase}>
                {isMobile ? t("mobileAccum") : t("accumulated")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground text-center">
                  {t("loading")}
                </TableCell>
              </TableRow>
            ) : rows.length ? (
              rows.map((row) => (
                <TableRow key={row.date}>
                  {/* Mobile: dd/MM; Desktop: dd/MM/yyyy */}
                  <TableCell className={cn(cellBase, textSize, "whitespace-nowrap")}>
                    {formatDate(row.date, isMobile)}
                  </TableCell>
                  <TableCell className={cn(cellRight, textSize, "tabular-nums")}>
                    {fmtVal(row.income)}
                  </TableCell>
                  <TableCell className={cn(cellRight, textSize, "tabular-nums")}>
                    {fmtVal(row.expense)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      cellRight,
                      textSize,
                      "tabular-nums",
                      row.net < 0 && "text-destructive"
                    )}
                  >
                    {fmtVal(row.net)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      cellRight,
                      textSize,
                      "tabular-nums",
                      row.accumulated < 0 && "text-destructive"
                    )}
                  >
                    {fmtVal(row.accumulated)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground text-center">
                  {t("noMovement")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          <TableFooter className="font-bold">
            <TableRow>
              <TableCell className={cn(cellBase, textSize, "text-center")}>
                {rows.length}
              </TableCell>
              <TableCell className={cn(cellRight, textSize, "tabular-nums")}>
                {fmtVal(totalIncome)}
              </TableCell>
              <TableCell className={cn(cellRight, textSize, "tabular-nums")}>
                {fmtVal(totalExpense)}
              </TableCell>
              <TableCell
                className={cn(
                  cellRight,
                  textSize,
                  "tabular-nums",
                  totalBalance < 0 && "text-destructive"
                )}
              >
                {fmtVal(totalBalance)}
              </TableCell>
              <TableCell
                className={cn(
                  cellRight,
                  textSize,
                  "tabular-nums",
                  finalAccumulated < 0 && "text-destructive"
                )}
              >
                {fmtVal(finalAccumulated)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  )
}
