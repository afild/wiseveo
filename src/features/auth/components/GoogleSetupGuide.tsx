"use client"

import { useId, useState } from "react"
import { useTranslations } from "next-intl"
import { Check, ChevronDown, Copy, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { getGoogleRedirectUris } from "@/lib/google-redirect-uris"
import { cn } from "@/lib/utils"

const GOOGLE_CREDENTIALS_URL = "https://console.cloud.google.com/apis/credentials"
// i18n-ignore: nomes de variáveis de ambiente (dado, não texto de UI)
const GOOGLE_ENV_VARS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const

function CopyField({ label, value }: { label: string; value: string }) {
  const t = useTranslations("auth.firstAccess.googleGuide")
  const [copied, setCopied] = useState(false)
  const labelId = useId()

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Sem área de transferência (permissão/contexto inseguro): o valor fica
      // selecionável de uma vez só (select-all) para copiar à mão.
    }
  }

  return (
    <div className="space-y-1">
      <p id={labelId} className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="flex items-center gap-2">
        <code
          aria-labelledby={labelId}
          className="min-w-0 flex-1 select-all break-all rounded-md border bg-background px-2 py-1.5 font-mono text-[11px] leading-snug text-foreground"
        >
          {value}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1 px-2 text-xs"
          onClick={copy}
          aria-live="polite"
          aria-describedby={labelId}
        >
          {copied ? <Check className="size-3.5 text-positive" /> : <Copy className="size-3.5" />}
          {copied ? t("copied") : t("copy")}
        </Button>
      </div>
    </div>
  )
}

/**
 * Guia "Ative o login com Google" — só na tela de primeiro acesso, e só enquanto
 * GOOGLE_CLIENT_ID/SECRET não existirem. Os endereços de retorno vêm do host
 * atual (getAppUrl no servidor) e da mesma função que o fluxo OAuth usa.
 */
export function GoogleSetupGuide({ appUrl, className }: { appUrl: string; className?: string }) {
  const t = useTranslations("auth.firstAccess.googleGuide")
  const [open, setOpen] = useState(false)
  const uris = getGoogleRedirectUris(appUrl)

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn("mt-4 rounded-md border border-dashed border-border bg-muted/30 text-xs", className)}
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left font-medium text-foreground"
        >
          <span>{t("trigger")}</span>
          <ChevronDown
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 border-t border-dashed border-border px-3 pb-3 pt-3 text-muted-foreground">
        <p>{t("intro")}</p>
        <ol className="list-decimal space-y-3 pl-4">
          <li>
            <span>{t("step1")} </span>
            <a
              href={GOOGLE_CREDENTIALS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
            >
              {t("step1Link")}
              <ExternalLink className="size-3" />
            </a>
          </li>
          <li className="space-y-2">
            <p>{t("step2")}</p>
            <CopyField label={t("loginUriLabel")} value={uris.login} />
            <CopyField label={t("calendarUriLabel")} value={uris.calendar} />
          </li>
          <li className="space-y-2">
            <p>{t("envTitle")}</p>
            <div className="flex flex-wrap gap-1.5">
              {GOOGLE_ENV_VARS.map((name) => (
                <code key={name} className="rounded-md border bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                  {name}
                </code>
              ))}
            </div>
            <p>{t("envHint")}</p>
          </li>
        </ol>
      </CollapsibleContent>
    </Collapsible>
  )
}
