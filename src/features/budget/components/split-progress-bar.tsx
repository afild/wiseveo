"use client"

import { useState, useEffect } from "react"

const G_GREEN = "var(--positive)"
const G_YELLOW = "var(--warning)"
const G_RED = "var(--destructive)"

const GRADIENT = `linear-gradient(to right, ${G_GREEN} 0%, ${G_YELLOW} 50%, ${G_RED} 80%, ${G_RED} 100%)`

interface SplitProgressBarProps {
  paidPct: number   // percentual do limite que está "Pago"
  totalPct: number  // percentual do limite total (pago + agendado)
  delay?: number
}

export function SplitProgressBar({
  paidPct,
  totalPct,
  delay = 0,
}: SplitProgressBarProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50 + delay)
    return () => clearTimeout(t)
  }, [delay])

  const clampedPaid = mounted ? Math.min(paidPct, 100) : 0
  const clampedTotal = mounted ? Math.min(totalPct, 100) : 0

  const paidRightInset = 100 - clampedPaid
  const totalRightInset = 100 - clampedTotal

  // Se não há valor agendado, renderiza igual ao GradientProgressBar original
  const hasScheduled = clampedTotal > clampedPaid

  return (
    <div className="relative h-1.5 rounded-full bg-muted shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)]">
      {/* Camada agendado: semi-transparente, estende até totalPct */}
      {hasScheduled && (
        <div
          className="absolute inset-0 transition-[clip-path] duration-1000"
          style={{
            background: GRADIENT,
            opacity: 0.35,
            clipPath: `inset(0 ${totalRightInset}% 0 0 round 100px)`,
            WebkitClipPath: `inset(0 ${totalRightInset}% 0 0 round 100px)`,
            transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
      )}
      {/* Camada pago: totalmente opaca, estende até paidPct */}
      <div
        className="absolute inset-0 transition-[clip-path] duration-1000"
        style={{
          background: GRADIENT,
          clipPath: `inset(0 ${paidRightInset}% 0 0 round 100px)`,
          WebkitClipPath: `inset(0 ${paidRightInset}% 0 0 round 100px)`,
          transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      />
    </div>
  )
}
