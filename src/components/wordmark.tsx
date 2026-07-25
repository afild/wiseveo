import { cn } from "@/lib/utils"

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display tracking-tight", className)}>
      {/* i18n-ignore: wordmark da marca, palavra única e não traduzível (Brand Book cap. 04) */}
      <span className="font-medium">WISE</span>
      {/* i18n-ignore: wordmark da marca (Brand Book cap. 04) */}
      <span className="font-extrabold">VEO</span>
    </span>
  )
}
