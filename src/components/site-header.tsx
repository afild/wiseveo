"use client"

import * as React from "react"
import { Settings, CalendarRange } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { usePathname } from "next/navigation"
import { ModeToggle } from "@/components/mode-toggle"
import { LocaleMenu } from "@/components/locale-menu"
import DatePicker from "@/components/date-picker"
import { useDateRange } from "@/contexts/date-range-context"
import { useDeviceClass } from "@/hooks/use-device-class"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

interface SiteHeaderProps {
  onOpenThemeCustomizer?: () => void
}



// ─── Mobile DatePicker Sheet ──────────────────────────────────────────────────

interface MobileDatePickerSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dateRange: { from: Date; to: Date }
  onChangeDateRange: (range: { from: Date; to: Date }) => void
}

function MobileDatePickerSheet({
  open,
  onOpenChange,
  dateRange,
  onChangeDateRange,
}: MobileDatePickerSheetProps) {
  const t = useTranslations("common")

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="pb-safe rounded-t-2xl max-h-[92dvh] overflow-y-auto">
        <SheetHeader className="mb-2">
          <SheetTitle className="text-sm font-semibold">{t("selectPeriod")}</SheetTitle>
        </SheetHeader>
        <DatePicker
          value={dateRange}
          onChange={(val) => {
            if (val && "from" in val) {
              onChangeDateRange(val as { from: Date; to: Date })
              onOpenChange(false)
            }
          }}
          mode="range"
        />
      </SheetContent>
    </Sheet>
  )
}

// ─── Main Header ──────────────────────────────────────────────────────────────

export function SiteHeader({ onOpenThemeCustomizer }: SiteHeaderProps) {
  const { dateRange, setDateRange } = useDateRange()
  const pathname = usePathname()
  const { isMobile, isTablet } = useDeviceClass()
  const [mobileDatePickerOpen, setMobileDatePickerOpen] = React.useState(false)
  const t = useTranslations("Routes")
  const tCommon = useTranslations("common")

  const routeKeys = [
    "/dashboard", "/insights", "/transactions", "/recurring", "/budget",
    "/analysis", "/forecasting", "/banks", "/calendar", "/configuracoes",
  ];

  const getPageInfo = (path: string) => {
    let match = routeKeys.find(route => path === route);
    if (!match) {
      match = routeKeys.find(route => path.startsWith(route) && route !== "/");
    }

    if (match) {
      const key = match.replace(/\//g, "_").replace(/^_/, "");
      return {
        title: t(`${key}.title` as never),
        description: t(`${key}.description` as never),
      }
    }
    return { title: t("default.title"), description: t("default.description") }
  }

  const { title, description } = getPageInfo(pathname)

  return (
    <>
      <header
        className={cn(
          "flex shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear",
          "group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)",
          // Taller on desktop, compact on mobile
          isMobile ? "h-14" : "h-(--header-height)"
        )}
      >
        <div
          className={cn(
            "flex w-full items-center gap-1 py-3",
            isMobile ? "px-3" : "px-4 lg:gap-2 lg:px-6"
          )}
        >
          {/* Sidebar trigger — hidden on mobile (uses bottom nav instead) */}
          {!isMobile && <SidebarTrigger className="-ml-1" />}
          {!isMobile && (
            <Separator
              orientation="vertical"
              className="mx-2 data-[orientation=vertical]:h-4"
            />
          )}

          {/* Page title */}
          <div className="flex-1 flex flex-col justify-center min-w-0">
            <h1
              className={cn(
                "font-display font-semibold tracking-tight leading-none truncate",
                isMobile ? "text-base" : "text-sm md:text-base"
              )}
            >
              {title}
            </h1>
            {/* Description hidden on mobile to save vertical space */}
            {!isMobile && (
              <p className="text-xs md:text-sm text-muted-foreground leading-none mt-1.5 truncate">
                {description}
              </p>
            )}
          </div>

          {/* Right actions */}
          <div className="ml-auto flex items-center gap-2">
            {/* Mobile: calendar icon button that opens a sheet */}
            {isMobile ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label={tCommon("selectPeriod")}
                onClick={() => setMobileDatePickerOpen(true)}
                className="touch-target"
              >
                <CalendarRange className="h-5 w-5" />
              </Button>
            ) : (
              /* Desktop/tablet: full DatePicker inline */
              <DatePicker
                value={dateRange}
                onChange={(val) => {
                  if (val && "from" in val) {
                    setDateRange(val as { from: Date; to: Date })
                  }
                }}
                mode="range"
              />
            )}

            <LocaleMenu />

            <ModeToggle />

            {/* Theme customizer — desktop/tablet only */}
            {!isMobile && onOpenThemeCustomizer && (
              <Button
                variant="outline"
                size="icon"
                onClick={onOpenThemeCustomizer}
                className="cursor-pointer"
              >
                <Settings className="h-[1.2rem] w-[1.2rem]" />
                <span className="sr-only">{tCommon("openAppearanceCustomizer")}</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile DatePicker Sheet */}
      {isMobile && (
        <MobileDatePickerSheet
          open={mobileDatePickerOpen}
          onOpenChange={setMobileDatePickerOpen}
          dateRange={dateRange}
          onChangeDateRange={setDateRange}
        />
      )}
    </>
  )
}
