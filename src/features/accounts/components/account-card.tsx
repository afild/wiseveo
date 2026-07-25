"use client"

import { Landmark, MoreVertical } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useMonetaryFormattingSafe } from "@/hooks/use-monetary-formatting"
import { formatAppDate } from "@/i18n/format"

interface AccountCardProps {
  name: string
  type: string
  currentBalance: number
  initialBalance: number
  legacyDate: string
}

export function AccountCard({
  name,
  type,
  currentBalance,
  initialBalance,
  legacyDate,
}: AccountCardProps) {
  const t = useTranslations("accounts")
  const locale = useLocale()
  const monetary = useMonetaryFormattingSafe()

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription>
          <div className="flex gap-3 items-center">
            <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Landmark className="size-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold uppercase tracking-tight text-foreground leading-none">
                {name}
              </span>
              <span className="text-[10px] uppercase font-medium text-muted-foreground/60 mt-0.5">
                {type}
              </span>
            </div>
          </div>
        </CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl font-display">
          {monetary.formatMonetaryValue(currentBalance)}
        </CardTitle>
        <CardAction>
          <button
            type="button"
            className="text-muted-foreground/40 hover:text-foreground transition-colors p-1"
            aria-label={t("card.optionsAriaLabel")}
            title={t("card.optionsAriaLabel")}
          >
            <MoreVertical className="size-5" />
          </button>
        </CardAction>
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1.5 text-sm">
        <div className="line-clamp-1 flex gap-2 font-medium text-muted-foreground/60">
          {t("card.currentBalance")}
        </div>
        <div className="text-muted-foreground text-xs">
          {t("card.initialLabel")} {monetary.formatMonetaryValue(initialBalance)} — {formatAppDate(new Date(legacyDate), "dd/MM/yyyy", locale)}
        </div>
      </CardFooter>
    </Card>
  )
}
