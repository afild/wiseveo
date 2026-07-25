"use client"

import * as React from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { MobileNav } from "@/components/mobile-nav"
import { ThemeCustomizer, ThemeCustomizerTrigger } from "@/components/theme-customizer"
import { useSidebarConfig } from "@/hooks/use-sidebar-config"
import { useDeviceClass } from "@/hooks/use-device-class"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"

interface BaseLayoutProps {
  children: React.ReactNode
  title?: string
  description?: string
}

export function BaseLayout({ children, title, description }: BaseLayoutProps) {
  const [themeCustomizerOpen, setThemeCustomizerOpen] = React.useState(false)
  const { config } = useSidebarConfig()
  const { isMobile, isTablet } = useDeviceClass()

  // On tablet: force icon-only collapsed sidebar for more content space
  const tabletCollapsible = isTablet ? "icon" : config.collapsible

  // Content inside SidebarInset is shared across left/right sidebar layouts
  const mainContent = (
    <SidebarInset>
      <SiteHeader onOpenThemeCustomizer={() => setThemeCustomizerOpen(true)} />
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            {title && (
              <div className="px-4 lg:px-6">
                <div className="flex flex-col gap-2">
                  <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
                  {description && (
                    <p className="text-muted-foreground">{description}</p>
                  )}
                </div>
              </div>
            )}
            {children}
          </div>
        </div>
      </div>

      {/* Spacer so content isn't hidden under the mobile bottom nav */}
      {isMobile && <div className="mobile-nav-spacer" aria-hidden="true" />}

      <SiteFooter />
    </SidebarInset>
  )

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "16rem",
          "--sidebar-width-icon": "3rem",
          "--header-height": "calc(var(--spacing) * 14)",
        } as React.CSSProperties
      }
      className={config.collapsible === "none" ? "sidebar-none-mode" : ""}
    >
      {/* ── Desktop / Tablet: sidebar visible ─────────────────────────── */}
      {config.side === "left" ? (
        <>
          {/* On mobile: hide sidebar entirely; it's replaced by MobileNav */}
          {!isMobile && (
            <AppSidebar
              variant={config.variant}
              collapsible={tabletCollapsible}
              side={config.side}
            />
          )}
          {mainContent}
        </>
      ) : (
        <>
          {mainContent}
          {!isMobile && (
            <AppSidebar
              variant={config.variant}
              collapsible={tabletCollapsible}
              side={config.side}
            />
          )}
        </>
      )}

      {/* ── Mobile: bottom navigation bar ──────────────────────────────── */}
      <MobileNav />

      {/* Theme Customizer (desktop/tablet only — mobile accesses via settings) */}
      {!isMobile && (
        <>
          <ThemeCustomizerTrigger onClick={() => setThemeCustomizerOpen(true)} />
          <ThemeCustomizer
            open={themeCustomizerOpen}
            onOpenChange={setThemeCustomizerOpen}
          />
        </>
      )}
    </SidebarProvider>
  )
}
