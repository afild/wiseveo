"use client"

import React from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { DemoWriteGuard } from "@/components/demo-write-guard"
import { DateClosingGuard } from "@/features/security/components/date-closing-guard"
import { DateClosingProvider } from "@/features/security/components/date-closing-provider"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { ThemeCustomizer } from "@/components/theme-customizer"
import { Toaster } from "@/components/ui/sonner"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { DateRangeProvider } from "@/contexts/date-range-context"
import { MonetaryPreferencesProvider } from "@/contexts/monetary-preferences-context"
import { SidebarConfigProvider, useSidebarConfig as useSidebarConfigContext } from "@/contexts/sidebar-context"
import { useThemePreferences } from "@/contexts/theme-preferences-context"
import { useSidebarConfig } from "@/hooks/use-sidebar-config"

import { MobileNav } from "@/components/mobile-nav"

function ApplyDashboardPreferences() {
  const { preferences } = useThemePreferences()
  const { updateConfig } = useSidebarConfigContext()

  React.useEffect(() => {
    updateConfig({
      variant: preferences.sidebarVariant,
      collapsible: preferences.sidebarCollapsible,
      side: preferences.sidebarSide,
    })
  }, [
    preferences.sidebarCollapsible,
    preferences.sidebarSide,
    preferences.sidebarVariant,
    updateConfig,
  ])

  return null
}

function DashboardContent({
  children,
}: {
  children: React.ReactNode
}) {
  const { config } = useSidebarConfig()
  const [themeCustomizerOpen, setThemeCustomizerOpen] = React.useState(false)

  return (
    <SidebarProvider
      style={{
        "--sidebar-width": "16rem",
        "--sidebar-width-icon": "3rem",
        "--header-height": "calc(var(--spacing) * 14)",
      } as React.CSSProperties}
      className={config.collapsible === "none" ? "sidebar-none-mode" : ""}
    >
      {config.side === "left" ? (
        <>
          <AppSidebar
            variant={config.variant}
            collapsible={config.collapsible}
            side={config.side}
          />
          <SidebarInset>
            <SiteHeader
              onOpenThemeCustomizer={() => setThemeCustomizerOpen(true)}
            />
            <div className="flex flex-1 flex-col">
              <div className="@container/main flex flex-1 flex-col gap-2">
                <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
                  {children}
                </div>
              </div>
            </div>
            <SiteFooter />
            {/* Mobile spacer to prevent fixed MobileNav overlap */}
            <div className="mobile-nav-spacer md:hidden" />
          </SidebarInset>
        </>
      ) : (
        <>
          <SidebarInset>
            <SiteHeader
              onOpenThemeCustomizer={() => setThemeCustomizerOpen(true)}
            />
            <div className="flex flex-1 flex-col">
              <div className="@container/main flex flex-1 flex-col gap-2">
                <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
                  {children}
                </div>
              </div>
            </div>
            <SiteFooter />
            {/* Mobile spacer to prevent fixed MobileNav overlap */}
            <div className="mobile-nav-spacer md:hidden" />
          </SidebarInset>
          <AppSidebar
            variant={config.variant}
            collapsible={config.collapsible}
            side={config.side}
          />
        </>
      )}
      <ThemeCustomizer
        open={themeCustomizerOpen}
        onOpenChange={setThemeCustomizerOpen}
      />
      
      {/* Bottom Nav for Mobile devices */}
      <MobileNav />
    </SidebarProvider>
  )
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarConfigProvider>
      <MonetaryPreferencesProvider>
        <DateRangeProvider>
          <ApplyDashboardPreferences />
          <DateClosingProvider>
            <DateClosingGuard>
              <DashboardContent>{children}</DashboardContent>
            </DateClosingGuard>
            <DemoWriteGuard />
          </DateClosingProvider>
          <Toaster />
        </DateRangeProvider>
      </MonetaryPreferencesProvider>
    </SidebarConfigProvider>
  )
}
