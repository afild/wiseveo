"use client"

import { useTranslations } from "next-intl"
import { Presentation } from "lucide-react"

/**
 * Faixa "isto é uma demonstração" das áreas ilustrativas da demo (Advisor e as
 * abas Avisos/Integrações/Admin). Sem texto próprio, mostra o aviso genérico de
 * dados de exemplo; a área que precisa de outra frase passa a dela.
 */
export function DemoShowcaseBanner({ text }: { text?: string }) {
  const t = useTranslations("demo.showcase")
  return (
    <p className="flex items-start gap-2 rounded-lg border border-dashed border-info/40 bg-info/5 p-3 text-xs text-muted-foreground">
      <Presentation className="mt-0.5 size-3.5 shrink-0 text-info" />
      {text ?? t("description")}
    </p>
  )
}
