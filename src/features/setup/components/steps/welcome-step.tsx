"use client"

import { Button } from "@/components/ui/button"
import { Logo } from "@/components/logo"
import { Globe } from "lucide-react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { LOCALES, LOCALE_COOKIE_NAME, LOCALE_META, type AppLocale } from "@/i18n/config"

interface WelcomeStepProps {
  locale: AppLocale
  onLocaleChange: (locale: AppLocale) => void
  onNext: () => void
}

const locales = LOCALES.map((code) => ({ code, ...LOCALE_META[code] }))

export function WelcomeStep({ locale, onLocaleChange, onNext }: WelcomeStepProps) {
  const t = useTranslations("setup.welcome")
  const router = useRouter()

  return (
    <div className="flex flex-col items-center gap-8 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Logo + Title */}
      <div className="flex flex-col items-center gap-4">
        <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20">
          <Logo size={48} className="text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {t("title")} <span className="text-primary">{t("brand")}</span>
          </h1>
          <p className="text-muted-foreground mt-2 text-base max-w-md">
            {t("subtitle")}
          </p>
        </div>
      </div>

      {/* Language Selection */}
      <div className="flex flex-col items-center gap-3 w-full max-w-sm">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Globe className="w-4 h-4" />
          <span>{t("chooseLanguage")}</span>
        </div>
        <div className="grid grid-cols-3 gap-2 w-full">
          {locales.map((l) => (
            <button
              key={l.code}
              onClick={() => {
                onLocaleChange(l.code)
                document.cookie = `${LOCALE_COOKIE_NAME}=${l.code}; path=/; max-age=31536000; SameSite=Lax`
                router.refresh()
              }}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all duration-200 cursor-pointer ${
                locale === l.code
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-muted hover:border-muted-foreground/30"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático local, sem otimização necessária */}
              <img src={l.flagSrc} alt="" className="size-8 rounded-full" />
              <span className="text-xs font-medium">{l.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Quick Start info */}
      <div className="flex flex-col gap-2 text-sm text-muted-foreground max-w-md">
        <p>{t("info")}</p>
      </div>

      <Button size="lg" onClick={onNext} className="w-full max-w-sm text-base">
        {t("start")}
      </Button>
    </div>
  )
}
