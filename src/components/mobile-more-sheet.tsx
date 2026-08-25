"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  Calendar,
  Calculator,
  LayoutPanelLeft,
  Sparkles,
  RotateCcw,
  Landmark,
  Settings,
  LineChart,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { isDemoDisabledRoute } from "@/lib/demo-routes"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useTranslations } from "next-intl"

// ─── Secondary nav items (shown in the "More" sheet) ─────────────────────────
interface SecondaryNavItem {
  labelKey: string
  href: string
  icon: LucideIcon
  descriptionKey?: string
}

const SECONDARY_NAV: SecondaryNavItem[] = [
  {
    labelKey: "insights",
    href: "/insights",
    icon: LayoutPanelLeft,
    descriptionKey: "insights",
  },
  {
    labelKey: "advisor",
    href: "/advisor",
    icon: Sparkles,
    descriptionKey: "advisor",
  },
  {
    labelKey: "recorrentes",
    href: "/recurring",
    icon: RotateCcw,
    descriptionKey: "recurring",
  },
  {
    labelKey: "analise",
    href: "/analysis",
    icon: Calculator,
    descriptionKey: "analysis",
  },
  {
    labelKey: "forecasting",
    href: "/forecasting",
    icon: LineChart,
    descriptionKey: "forecasting",
  },
  {
    labelKey: "bancos",
    href: "/banks",
    icon: Landmark,
    descriptionKey: "banks",
  },
  {
    labelKey: "configuracoes",
    href: "/configuracoes",
    icon: Settings,
    descriptionKey: "settings",
  },
]

// ─── Component ────────────────────────────────────────────────────────────────

interface MobileMoreSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * `MobileMoreSheet` — Bottom sheet with secondary navigation items.
 * Shown when the user taps "Mais" in the `MobileNav`.
 */
export function MobileMoreSheet({ open, onOpenChange }: MobileMoreSheetProps) {
  const pathname = usePathname()
  const tSidebar = useTranslations("sidebar")
  const t = useTranslations("common.mobileMoreSheet")

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/")
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="pb-safe rounded-t-2xl max-h-[85dvh]"
      >
        <SheetHeader className="mb-4">
          <SheetTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            {t("title")}
          </SheetTitle>
        </SheetHeader>

        <nav aria-label={t("secondaryNav")}>
          <ul className="flex flex-col gap-1" role="list">
            {SECONDARY_NAV.filter((item) => !isDemoDisabledRoute(item.href)).map((item) => {
              const active = isActive(item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => onOpenChange(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 rounded-lg",
                      "touch-target transition-colors duration-150",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "flex items-center justify-center h-9 w-9 rounded-lg shrink-0",
                        active ? "bg-primary/15" : "bg-muted"
                      )}
                    >
                      <item.icon
                        className="h-4 w-4"
                        strokeWidth={active ? 2.5 : 2}
                        aria-hidden="true"
                      />
                    </span>
                    <span className="flex flex-col min-w-0">
                      <span className={cn("text-sm font-medium leading-tight", active && "font-semibold")}>
                        {tSidebar(item.labelKey as never)}
                      </span>
                      {item.descriptionKey && (
                        <span className="text-xs text-muted-foreground leading-tight mt-0.5 truncate">
                          {t(`descriptions.${item.descriptionKey}` as never)}
                        </span>
                      )}
                    </span>
                    {active && (
                      <span
                        aria-hidden="true"
                        className="ml-auto h-2 w-2 rounded-full bg-primary shrink-0"
                      />
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  )
}
