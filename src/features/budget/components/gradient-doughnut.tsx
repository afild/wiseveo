"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { formatPercentValue } from "@/lib/monetary"

const G_GREEN = "var(--positive)"
const G_YELLOW = "var(--warning)"
const G_RED = "var(--destructive)"

interface GradientDoughnutProps {
  pct: number
  size?: number
}

export function GradientDoughnut({ pct, size = 160 }: GradientDoughnutProps) {
  const t = useTranslations("budget")
  const [fillDeg, setFillDeg] = useState(0)

  useEffect(() => {
    const target = Math.min(pct, 100) * 3.6
    const duration = 1400
    const start = performance.now()
    let raf: number

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setFillDeg(target * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [pct])

  const innerR = size * 0.345
  const donutMask = `radial-gradient(circle, transparent ${innerR - 1}px, black ${innerR}px)`

  const fillMask = {
    WebkitMaskImage: [
      donutMask,
      `conic-gradient(from -90deg, black 0deg, black ${fillDeg}deg, transparent ${fillDeg}deg 360deg)`,
    ].join(", "),
    WebkitMaskComposite: "destination-in" as const,
    maskImage: [
      donutMask,
      `conic-gradient(from -90deg, black 0deg, black ${fillDeg}deg, transparent ${fillDeg}deg 360deg)`,
    ].join(", "),
    maskComposite: "intersect" as const,
  }

  const abs: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    borderRadius: "50%",
  }

  return (
    <div
      style={{ position: "relative", width: size, height: size, flexShrink: 0 }}
    >
      <div
        style={{
          ...abs,
          filter:
            "drop-shadow(0 8px 20px rgba(0,0,0,0.28)) drop-shadow(0 2px 6px rgba(0,0,0,0.16))",
        }}
      >
        {/* Track */}
        <div
          className="bg-muted"
          style={{ ...abs, WebkitMask: donutMask, mask: donutMask }}
        />

        {/* Gradient fill arc */}
        <div
          style={{
            ...abs,
            background: `conic-gradient(from -90deg, ${G_GREEN} 0%, ${G_YELLOW} 50%, ${G_RED} 80%, ${G_RED} 100%)`,
            ...fillMask,
          }}
        />

        {/* 3D shine */}
        <div
          style={{
            ...abs,
            WebkitMask: donutMask,
            mask: donutMask,
            background: `
              radial-gradient(ellipse at 64% 28%, rgba(255,255,255,0.42) 0%, transparent 52%),
              radial-gradient(ellipse at 32% 70%, rgba(0,0,0,0.18) 0%, transparent 44%)
            `,
            pointerEvents: "none",
          }}
        />
      </div>

      {/* Center text */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          className={pct <= 50 ? "text-positive" : pct <= 80 ? "text-warning" : "text-destructive"}
          style={{
            fontSize: size * 0.22,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.02em",
            lineHeight: 1,
          }}
        >
          {formatPercentValue(pct, 0)}
        </span>
        <span
          className="text-muted-foreground"
          style={{
            fontSize: size * 0.09,
            fontWeight: 600,
            marginTop: 4,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {t("overview.spent")}
        </span>
      </div>
    </div>
  )
}
