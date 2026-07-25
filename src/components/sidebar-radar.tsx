"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { useSidebar } from "@/components/ui/sidebar"
import { useMonetaryFormattingSafe } from "@/hooks/use-monetary-formatting"
import { startOfMonth, endOfMonth } from "date-fns"

interface CashflowPoint {
  date: string
  income: number
  expense: number
  balance: number
}

export function SidebarRadar() {
  const { state } = useSidebar()
  const collapsed = state === "collapsed"
  const t = useTranslations("common.sidebarRadar")
  const monetary = useMonetaryFormattingSafe()

  const [todayBalance, setTodayBalance] = React.useState<number | null>(null)
  const [monthEndBalance, setMonthEndBalance] = React.useState<number | null>(null)

  React.useEffect(() => {
    async function fetchData() {
      const now = new Date()
      const start = startOfMonth(now)
      const end = endOfMonth(now)

      const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`
      const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`
      
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`

      try {
        const res = await fetch(`/api/dashboard/cashflow?from=${startStr}&to=${endStr}`)
        if (!res.ok) return
        
        const data = await res.json()
        const points: CashflowPoint[] = data.points || []

        if (points.length > 0) {
          // Saldo do último dia do mês (último elemento do array retornado)
          setMonthEndBalance(points[points.length - 1].balance)

          // Saldo de hoje
          const todayPoint = points.find(p => p.date === todayStr)
          if (todayPoint) {
            setTodayBalance(todayPoint.balance)
          } else {
            // Se hoje não estiver no array por algum motivo (ex: bug no cashflow), pega o último disponível até hoje
            const pastPoints = points.filter(p => p.date <= todayStr)
            if (pastPoints.length > 0) {
              setTodayBalance(pastPoints[pastPoints.length - 1].balance)
            }
          }
        }
      } catch (err) {
        console.error("Erro ao buscar cashflow para o radar", err)
      }
    }

    fetchData()
    // Seria ideal adicionar um intervalo ou listener para atualizar quando houver mudanças,
    // mas por hora faremos o fetch on mount e quando a página ganhar foco.
    
    const handleFocus = () => fetchData()
    window.addEventListener("focus", handleFocus)
    return () => window.removeEventListener("focus", handleFocus)
  }, [])

  const getRadarColor = (balance: number | null): string => {
    if (balance === null) return "var(--sidebar-accent-foreground)"
    if (balance < 100) return "var(--destructive)"
    if (balance < 300) return "var(--warning)"
    return "var(--positive)"
  }

  return (
    <div
      className={`relative flex min-h-[80px] items-center border-b border-sidebar-border transition-all duration-200 ${
        collapsed ? "justify-center py-4" : "justify-between px-4 py-4"
      } mb-4`} // mb-4 to increase spacing between header and Dashboards group
    >
      {/* Informações do Saldo - Visíveis apenas quando expandido */}
      {!collapsed && (
        <div className="flex flex-col gap-1 overflow-hidden">
          <span className="text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/60">
            {t("currentBalance")}
          </span>
          <span className="font-display truncate text-2xl font-bold text-primary">
            {todayBalance !== null ? monetary.formatNumberValue(todayBalance) : "---"}
          </span>
          <span className="truncate text-[11px] text-sidebar-foreground/60">
            {t("projected")} {monthEndBalance !== null ? monetary.formatNumberValue(monthEndBalance) : "---"}
          </span>
        </div>
      )}

      {/* Radar (Bolinha animada) */}
      <div
        className="status-radar w-3 h-3 min-w-3 min-h-3 shrink-0"
        style={{ color: getRadarColor(monthEndBalance) }}
        title={
          collapsed
            ? t("tooltipCollapsed", {
                today: todayBalance !== null ? monetary.formatMonetaryValue(todayBalance) : "---",
                projected: monthEndBalance !== null ? monetary.formatMonetaryValue(monthEndBalance) : "---",
              })
            : t("tooltipExpanded", {
                projected: monthEndBalance !== null ? monetary.formatMonetaryValue(monthEndBalance) : "---",
              })
        }
      >
        <div className="ring" />
      </div>
    </div>
  )
}
