"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
} from "date-fns"
import type {
  CalendarDayStatement,
  CalendarStatementResponse,
} from "../types"

function utcDateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

function toDateParam(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

interface UseFinancialCalendarOptions {
  initialData: CalendarStatementResponse | null
}

export function useFinancialCalendar({
  initialData,
}: UseFinancialCalendarOptions) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<"month" | "list">("month")
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [showDayDetail, setShowDayDetail] = useState(false)
  const [days, setDays] = useState<CalendarDayStatement[]>(
    initialData?.days ?? [],
  )
  const [openingBalance, setOpeningBalance] = useState(
    initialData?.openingBalance ?? 0,
  )
  const [isLoading, setIsLoading] = useState(false)

  const latestRequestRef = useRef(0)
  const initialLoadDone = useRef(!!initialData)

  // Build calendar grid days (includes prev/next month padding)
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)

  const calendarStart = new Date(monthStart)
  calendarStart.setDate(calendarStart.getDate() - monthStart.getDay())

  const calendarEnd = new Date(monthEnd)
  calendarEnd.setDate(calendarEnd.getDate() + (6 - monthEnd.getDay()))

  const calendarDays = eachDayOfInterval({
    start: calendarStart,
    end: calendarEnd,
  })

  // Build map for quick lookup
  const daysMap = new Map<string, CalendarDayStatement>()
  for (const day of days) {
    daysMap.set(day.date, day)
  }

  // Fetch data when month changes
  const fetchCalendarData = useCallback(async () => {
    const requestId = ++latestRequestRef.current
    setIsLoading(true)

    const from = toDateParam(startOfMonth(currentDate))
    const to = toDateParam(endOfMonth(currentDate))

    try {
      const res = await fetch(`/api/calendar?from=${from}&to=${to}`, {
        cache: "no-store",
      })
      if (!res.ok) throw new Error("Fetch failed") // i18n-ignore: mensagem interna de Error, capturada silenciosamente (mantém dados anteriores)

      const data: CalendarStatementResponse = await res.json()

      // Protect against race conditions
      if (requestId !== latestRequestRef.current) return

      setDays(data.days)
      setOpeningBalance(data.openingBalance)
    } catch {
      // Keep previous data on error
    } finally {
      if (requestId === latestRequestRef.current) {
        setIsLoading(false)
      }
    }
  }, [currentDate])

  useEffect(() => {
    // Skip first fetch if we have initial data from server
    if (initialLoadDone.current) {
      initialLoadDone.current = false
      return
    }
    fetchCalendarData()
  }, [fetchCalendarData])

  // Navigation
  const navigateMonth = useCallback(
    (direction: "prev" | "next") => {
      setCurrentDate(
        direction === "prev"
          ? subMonths(currentDate, 1)
          : addMonths(currentDate, 1),
      )
    },
    [currentDate],
  )

  const goToToday = useCallback(() => {
    setCurrentDate(new Date())
  }, [])

  // Salto direto de mês/ano (mini calendário da sidebar).
  const goToMonth = useCallback((date: Date) => {
    setCurrentDate(startOfMonth(date))
  }, [])

  const selectDate = useCallback((date: Date) => {
    setSelectedDate(date)
    setShowDayDetail(true)
  }, [])

  const closeDayDetail = useCallback(() => {
    setShowDayDetail(false)
  }, [])

  // Get the selected day's statement
  const selectedDayStatement = selectedDate
    ? daysMap.get(utcDateKey(selectedDate)) ?? null
    : null

  // Date range for Google sync
  const fromParam = toDateParam(monthStart)
  const toParam = toDateParam(monthEnd)

  return {
    currentDate,
    viewMode,
    setViewMode,
    selectedDate,
    showDayDetail,
    days,
    daysMap,
    calendarDays,
    openingBalance,
    isLoading,
    selectedDayStatement,
    fromParam,
    toParam,
    navigateMonth,
    goToToday,
    goToMonth,
    selectDate,
    closeDayDetail,
    refetch: fetchCalendarData,
  }
}
