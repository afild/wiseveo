"use client"

import * as React from "react"
import {
  Calculator,
  LayoutPanelLeft,
  LayoutDashboard,
  Calendar,
  Settings,
  ArrowLeftRight,
  Landmark,
  RotateCcw,
  Wallet,
  LineChart,
  Sparkles,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { Logo } from "@/components/logo"
import { Wordmark } from "@/components/wordmark"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { SidebarRadar } from "@/components/sidebar-radar"
import { useCurrentUser } from "@/features/auth/hooks/useCurrentUser"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

type SidebarSubItem = {
  title: string
  url: string
  isActive?: boolean
}

type SidebarNavItem = {
  title: string
  url: string
  icon?: LucideIcon
  isActive?: boolean
  items?: SidebarSubItem[]
}

type SidebarNavGroup = {
  label: string
  collapsible: boolean
  items: SidebarNavItem[]
}

const data: { navGroups: SidebarNavGroup[] } = {
  navGroups: [
    {
      // Sem rótulo: links principais na raiz do menu.
      label: "",
      collapsible: false,
      items: [
        {
          title: "Dashboard",
          url: "/dashboard",
          icon: LayoutDashboard,
        },
        {
          title: "Insights",
          url: "/insights",
          icon: LayoutPanelLeft,
        },
        {
          title: "Advisor",
          url: "/advisor",
          icon: Sparkles,
        },
        {
          title: "Transacoes",
          url: "/transactions",
          icon: ArrowLeftRight,
        },
        {
          title: "Recorrentes",
          url: "/recurring",
          icon: RotateCcw,
        },
        {
          title: "Orcamento",
          url: "/budget",
          icon: Wallet,
        },
        {
          title: "Analise",
          url: "/analysis",
          icon: Calculator,
        },
        {
          title: "Forecasting",
          url: "/forecasting",
          icon: LineChart,
        },
        {
          title: "Bancos",
          url: "/banks",
          icon: Landmark,
        },
        {
          title: "Calendario",
          url: "/calendar",
          icon: Calendar,
        },
        {
          title: "Configuracoes",
          url: "/configuracoes?tab=general",
          icon: Settings,
        },
      ],
    },
  ],
}

import { useTranslations } from "next-intl"
import { DEMO_DISABLED_ROUTES } from "@/lib/demo-routes"

/** Tira do menu o que a demo não tem. */
function hideDemoOnlyRoutes(groups: SidebarNavGroup[]): SidebarNavGroup[] {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") return groups
  return groups.map((group) => ({
    ...group,
    items: group.items.filter((item) => !DEMO_DISABLED_ROUTES.includes(item.url)),
  }))
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useCurrentUser()
  const t = useTranslations("sidebar")
  const userData = user ?? { name: "...", email: "", avatar: "" }
  // O Advisor não existe na demo (a página responde 404): o menu não pode
  // oferecer um caminho que não leva a lugar nenhum.
  const navGroups = React.useMemo(() => hideDemoOnlyRoutes(data.navGroups), [])

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard" aria-label={t("brandLabel")}>
                <div className="flex aspect-square size-8 items-center justify-center">
                  <Logo size={28} />
                </div>
                <span className="flex-1 truncate text-left text-base">
                  <Wordmark />
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      
      <SidebarRadar />

      <SidebarContent>
        {navGroups.map((group) => (
          <NavMain
            key={group.label}
            label={group.label}
            items={group.items}
            collapsible={group.collapsible}
          />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={userData} />
      </SidebarFooter>
    </Sidebar>
  )
}
