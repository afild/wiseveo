"use client"

import { useState, useEffect } from "react"

const G_GREEN = "var(--positive)"
const G_YELLOW = "var(--warning)"
const G_RED = "var(--destructive)"

interface GradientProgressBarProps {
  pct: number
  delay?: number
}

export function GradientProgressBar({
  pct,
  delay = 0,
}: GradientProgressBarProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50 + delay)
    return () => clearTimeout(t)
  }, [delay])

  const fillPct = mounted ? Math.min(pct, 100) : 0
  const rightInset = 100 - fillPct

  return (
    <div className="relative h-1.5 rounded-full bg-muted shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)]">
      <div
        className="absolute inset-0 transition-[clip-path] duration-1000"
        style={{
          background: `linear-gradient(to right, ${G_GREEN} 0%, ${G_YELLOW} 50%, ${G_RED} 80%, ${G_RED} 100%)`,
          clipPath: `inset(0 ${rightInset}% 0 0 round 100px)`,
          WebkitClipPath: `inset(0 ${rightInset}% 0 0 round 100px)`,
          transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      />
    </div>
  )
}
