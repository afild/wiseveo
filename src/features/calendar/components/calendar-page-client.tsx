"use client"

import { useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Grid3X3,
  List,
  ChevronDown,
  Menu,
  Loader2,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { formatAppDate } from "@/i18n/format"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet"
import { useFinancialCalendar } from "../hooks/use-financial-calendar"
import { FinancialCalendarGrid } from "./financial-calendar-grid"
import { FinancialCalendarList } from "./financial-calendar-list"
import { FinancialCalendarSidebar } from "./financial-calendar-sidebar"
import { DayStatementDialog } from "./day-statement-dialog"
import { GoogleConnectButton } from "./google-connect-button"
import { GoogleSyncButton } from "./google-sync-button"
import { GoogleClearButton } from "./google-clear-button"
import type { CalendarStatementResponse } from "../types"

interface CalendarPageClientProps {
  initialData: CalendarStatementResponse | null
  hasGoogleCalendar: boolean
  isGoogleConfigured?: boolean
}

export function CalendarPageClient({
  initialData,
  hasGoogleCalendar,
  isGoogleConfigured = false,
}: CalendarPageClientProps) {
  const t = useTranslations("calendar")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const [sheetOpen, setSheetOpen] = useState(false)

  const cal = useFinancialCalendar({ initialData })

  const googleSlot = hasGoogleCalendar ? (
    <div className="space-y-2">
      <GoogleSyncButton from={cal.fromParam} to={cal.toParam} />
      <GoogleClearButton />
    </div>
  ) : isGoogleConfigured ? (
    <GoogleConnectButton />
  ) : null

  const sidebar = (
    <FinancialCalendarSidebar
      currentDate={cal.currentDate}
      selectedDate={cal.selectedDate}
      onSelectDate={(date) => {
        cal.selectDate(date)
        setSheetOpen(false)
      }}
      onMonthChange={cal.goToMonth}
      days={cal.days}
      hasGoogle={hasGoogleCalendar}
      googleSlot={googleSlot}
    />
  )

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Sidebar — desktop only */}
      <div className="hidden xl:block w-72 shrink-0 border-r p-4 overflow-y-auto">
        {sidebar}
      </div>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Toolbar */}
        <div className="flex flex-col flex-wrap gap-4 p-4 border-b md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Mobile sidebar trigger */}
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="xl:hidden cursor-pointer"
                >
                  <Menu className="w-4 h-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80 p-4">
                {sidebar}
              </SheetContent>
            </Sheet>

            {/* Month navigation */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => cal.navigateMonth("prev")}
                className="cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => cal.navigateMonth("next")}
                className="cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={cal.goToToday}
                className="cursor-pointer"
              >
                {tCommon("datePicker.today")}
              </Button>
            </div>

            <h1 className="text-2xl font-semibold capitalize">
              {formatAppDate(cal.currentDate, "MMMM yyyy", locale)}
            </h1>

            {cal.isLoading && (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {/* View mode */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="cursor-pointer">
                {cal.viewMode === "month" ? (
                  <Grid3X3 className="w-4 h-4 mr-2" />
                ) : (
                  <List className="w-4 h-4 mr-2" />
                )}
                {cal.viewMode === "month" ? t("viewMode.month") : t("viewMode.list")}
                <ChevronDown className="w-4 h-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                onClick={() => cal.setViewMode("month")}
                className="cursor-pointer"
              >
                <Grid3X3 className="w-4 h-4 mr-2" />
                {t("viewMode.month")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => cal.setViewMode("list")}
                className="cursor-pointer"
              >
                <List className="w-4 h-4 mr-2" />
                {t("viewMode.list")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Content */}
        {cal.viewMode === "month" ? (
          <FinancialCalendarGrid
            currentDate={cal.currentDate}
            calendarDays={cal.calendarDays}
            daysMap={cal.daysMap}
            selectedDate={cal.selectedDate}
            onSelectDate={cal.selectDate}
          />
        ) : (
          <FinancialCalendarList
            days={cal.days}
            onSelectDate={cal.selectDate}
          />
        )}
      </div>

      {/* Day detail dialog */}
      <DayStatementDialog
        day={cal.selectedDayStatement}
        open={cal.showDayDetail}
        onOpenChange={cal.closeDayDetail}
        hasGoogle={hasGoogleCalendar}
      />
    </div>
  )
}
