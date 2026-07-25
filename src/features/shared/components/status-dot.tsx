"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export type StatusType = "PAID" | "PENDING" | "OVERDUE" | "SCHEDULED"

interface StatusDotProps {
  status: StatusType
  label?: string
  className?: string
}

const statusConfig: Record<StatusType, { color: string; label: string }> = {
  PAID: { color: "bg-positive", label: "Pago" },
  PENDING: { color: "bg-warning", label: "Pendente" },
  OVERDUE: { color: "bg-destructive", label: "Vencido" },
  SCHEDULED: { color: "bg-info", label: "Agendado" },
}

export function StatusDot({ status, label, className }: StatusDotProps) {
  const config = statusConfig[status]
  if (!config) return null

  const displayLabel = label || config.label

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center justify-center">
            <div
              className={cn(
                "size-2.5 rounded-full ring-2 ring-background ring-offset-1",
                config.color,
                className
              )}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>{displayLabel}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
