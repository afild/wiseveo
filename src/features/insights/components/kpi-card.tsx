"use client"

import type { LucideIcon } from "lucide-react"
import { AlertTriangle, Flame, Info, Shield } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { KpiZone } from "../types"

// Mesma linguagem de zonas dos cards de resumo do orçamento: tokens do tema
// ativo, funcionando em claro/escuro em todos os presets da galeria.
const ZONE_STYLES: Record<
  Exclude<KpiZone, "neutral">,
  { badge: string; Icon: LucideIcon; value: string }
> = {
  good: {
    value: "text-positive",
    badge: "bg-positive/15 text-positive border-positive/30",
    Icon: Shield,
  },
  warning: {
    value: "text-warning",
    badge: "bg-warning/15 text-warning border-warning/30",
    Icon: AlertTriangle,
  },
  critical: {
    value: "text-destructive",
    badge: "bg-destructive/15 text-destructive border-destructive/30",
    Icon: Flame,
  },
}

const CARD_BACKGROUND =
  "linear-gradient(to top, color-mix(in oklch, var(--primary) 5%, transparent), var(--card))"

interface KpiCardProps {
  icon: LucideIcon
  label: string
  /** Tooltip "como é calculado". */
  how: string
  value: React.ReactNode
  zone: KpiZone
  zoneLabel?: string
  /** Badge customizado no CardAction — substitui o badge de zona. */
  badge?: React.ReactNode
  footerTitle: string
  footerDetail?: string
  /** Área extra entre o valor e o footer (sparkline, barra de progresso). */
  children?: React.ReactNode
  muted?: boolean
}

export function KpiCard({
  icon: LabelIcon,
  label,
  how,
  value,
  zone,
  zoneLabel,
  badge,
  footerTitle,
  footerDetail,
  children,
  muted = false,
}: KpiCardProps) {
  const zoneStyle = zone === "neutral" ? null : ZONE_STYLES[zone]

  return (
    <Card
      className="@container/card"
      style={{ background: CARD_BACKGROUND }}
    >
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          <LabelIcon className="size-3.5" />
          <span className="min-w-0 truncate">{label}</span>
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <Info className="size-3.5 shrink-0 cursor-help opacity-60" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[260px] text-xs">
              {how}
            </TooltipContent>
          </Tooltip>
        </CardDescription>
        <CardTitle
          className={cn(
            "text-2xl font-semibold tabular-nums @[250px]/card:text-3xl font-display",
            muted ? "text-muted-foreground" : zoneStyle?.value,
          )}
        >
          {value}
        </CardTitle>
        {(badge || (zoneStyle && zoneLabel)) && (
          <CardAction>
            {badge ??
              (zoneStyle && zoneLabel && (
                <Badge variant="outline" className={zoneStyle.badge}>
                  <zoneStyle.Icon className="size-3" />
                  <span className="ml-1">{zoneLabel}</span>
                </Badge>
              ))}
          </CardAction>
        )}
      </CardHeader>
      {children && <CardContent className="pb-0">{children}</CardContent>}
      <CardFooter className="flex-col items-start gap-1.5 text-sm">
        <div className="font-medium">{footerTitle}</div>
        {footerDetail && (
          <div className="text-xs text-muted-foreground">{footerDetail}</div>
        )}
      </CardFooter>
    </Card>
  )
}
