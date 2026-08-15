"use client"

import { useLocale } from "next-intl"
import { useRouter } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Globe } from "lucide-react"
import { LOCALES, LOCALE_COOKIE_NAME, LOCALE_META } from "@/i18n/config"

/**
 * Aplica um idioma: grava o cookie de locale e persiste no perfil do usuário
 * (fire-and-forget), para canais sem cookie (Telegram, jobs) acompanharem.
 * O chamador dispara o router.refresh().
 */
export function applyUserLocale(newLocale: string) {
  document.cookie = `${LOCALE_COOKIE_NAME}=${newLocale}; path=/; max-age=31536000; SameSite=Lax`
  fetch("/api/user/preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale: newLocale }),
  }).catch(() => {})
}

export function LocaleSwitcher() {
  const locale = useLocale()
  const router = useRouter()

  const handleValueChange = (newLocale: string) => {
    applyUserLocale(newLocale)
    router.refresh()
  }

  return (
    <div className="flex items-center gap-2">
      <Globe className="h-4 w-4 text-muted-foreground" />
      <Select value={locale} onValueChange={handleValueChange}>
        <SelectTrigger className="w-[120px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LOCALES.map((code) => (
            <SelectItem key={code} value={code}>
              {LOCALE_META[code].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
