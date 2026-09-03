"use client"

import { Button } from "@/components/ui/button"
import { useTranslations } from "next-intl"
import { CheckCircle2, Server, User, ShieldCheck, Puzzle, LayoutList, Loader2 } from "lucide-react"

interface SummaryStepProps {
  useExistingData: boolean
  adminName: string
  adminEmail: string
  /** PIN de fechamento pronto para ir no Finalizar (4 dígitos e confirmação igual). */
  pinSet: boolean
  integrations: {
    google: boolean
    telegram: boolean
    openai: boolean
  }
  isConfiguring: boolean
  onNext: () => void
  onBack: () => void
}

export function SummaryStep({

  useExistingData,
  adminName,
  adminEmail,
  pinSet,
  integrations,
  isConfiguring,
  onNext,
  onBack,
}: SummaryStepProps) {
  const t = useTranslations("setup.summary")
  const tc = useTranslations("setup.common")
  const integrationCount = [integrations.google, integrations.telegram, integrations.openai].filter(Boolean).length

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="text-center">
        <div className="inline-flex p-3 rounded-xl bg-primary/10 border border-primary/20 mb-3">
          <CheckCircle2 className="w-6 h-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">{t("title")}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("subtitle")}
        </p>
      </div>

      <div className="space-y-3">
        {/* DB Summary */}
        <div className="flex items-center justify-between p-3 rounded-lg border border-muted bg-background/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted rounded-md text-foreground">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <p className="font-medium text-sm">{t("sectionDatabase")}</p>
              <p className="text-xs text-muted-foreground">
                {useExistingData ? t("dbExisting") : t("dbNew")}
              </p>
            </div>
          </div>
          <CheckCircle2 className="w-4 h-4 text-primary" />
        </div>

        {/* Admin Summary */}
        <div className="flex items-center justify-between p-3 rounded-lg border border-muted bg-background/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted rounded-md text-foreground">
              <User className="w-4 h-4" />
            </div>
            <div>
              <p className="font-medium text-sm">{t("sectionAdmin")}</p>
              <p className="text-xs text-muted-foreground">
                {adminName} ({adminEmail})
              </p>
            </div>
          </div>
          <CheckCircle2 className="w-4 h-4 text-primary" />
        </div>

        {/* PIN Summary */}
        <div className="flex items-center justify-between p-3 rounded-lg border border-muted bg-background/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted rounded-md text-foreground">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <p className="font-medium text-sm">{t("sectionPin")}</p>
              <p className="text-xs text-muted-foreground">{pinSet ? t("pinSet") : t("pinNotSet")}</p>
            </div>
          </div>
          <CheckCircle2 className="w-4 h-4 text-primary" />
        </div>

        {/* Chart of Accounts Summary */}
        <div className="flex items-center justify-between p-3 rounded-lg border border-muted bg-background/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted rounded-md text-foreground">
              <LayoutList className="w-4 h-4" />
            </div>
            <div>
              <p className="font-medium text-sm">{t("sectionChart")}</p>
              <p className="text-xs text-muted-foreground">
                {useExistingData ? t("chartPreserved") : t("chartNew")}
              </p>
            </div>
          </div>
          <CheckCircle2 className="w-4 h-4 text-primary" />
        </div>

        {/* Integrations Summary */}
        <div className="flex items-center justify-between p-3 rounded-lg border border-muted bg-background/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted rounded-md text-foreground">
              <Puzzle className="w-4 h-4" />
            </div>
            <div>
              <p className="font-medium text-sm">{t("sectionIntegrations")}</p>
              <p className="text-xs text-muted-foreground">
                {t("integrationCount", { count: integrationCount })}
              </p>
            </div>
          </div>
          <CheckCircle2 className="w-4 h-4 text-primary" />
        </div>
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-center">
        <p>{useExistingData ? t("finishNoteExisting") : t("finishNote")}</p>
      </div>

      {/* Navigation */}
      <div className="flex gap-3 pt-2">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={isConfiguring}
          className="flex-1"
        >
          {tc("back")}
        </Button>
        <Button
          onClick={onNext}
          disabled={isConfiguring}
          className="flex-1 font-semibold"
        >
          {isConfiguring ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {t("configuring")}
            </>
          ) : (
            t("finish")
          )}
        </Button>
      </div>
    </div>
  )
}

