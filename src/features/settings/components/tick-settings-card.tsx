"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { AlarmClock, CheckCircle2, ChevronDown, Copy, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

/**
 * O despertador (Configurações → Integrações, só SUPERADMIN).
 *
 * A hospedagem gratuita só permite um alarme por dia; boletim com horário
 * escolhido pela pessoa precisa de batidas de 15 em 15 minutos. A saída
 * combinada foi um serviço externo gratuito chamando esta URL — então a tela
 * entrega o endereço pronto para colar.
 *
 * O endereço aparece UMA vez, no momento em que é gerado: ele carrega o segredo.
 * Perdeu? Gera outro — e o anterior para de funcionar na mesma hora.
 */

export interface TickSecretView {
  configured: boolean
  source: "db" | "env" | null
}

interface TickSettingsCardProps {
  /** Sem a tabela de segredos não há onde guardar a chave. */
  structureReady: boolean
  initial: TickSecretView
}

export function TickSettingsCard({ structureReady, initial }: TickSettingsCardProps) {
  const t = useTranslations("settings.integrations.tick")
  const [status, setStatus] = React.useState(initial)
  const [url, setUrl] = React.useState<string | null>(null)
  const [working, setWorking] = React.useState(false)
  const [showSteps, setShowSteps] = React.useState(false)

  async function generate() {
    setWorking(true)
    try {
      const response = await fetch("/api/admin/notifications-tick", { method: "POST" })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) throw new Error(payload?.message ?? t("error"))
      setUrl(payload.data.url)
      setStatus({ configured: true, source: "db" })
      toast.success(t("generated"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("error"))
    } finally {
      setWorking(false)
    }
  }

  async function remove() {
    setWorking(true)
    try {
      const response = await fetch("/api/admin/notifications-tick", { method: "DELETE" })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) throw new Error(payload?.message ?? t("error"))
      setStatus(payload.data)
      setUrl(null)
      toast.success(t("removed"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("error"))
    } finally {
      setWorking(false)
    }
  }

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t("copied"))
    } catch {
      toast.error(t("copyFailed"))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlarmClock className="size-4 text-info" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("desc")}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!structureReady ? (
          <p className="text-sm text-muted-foreground">{t("needsPrepare")}</p>
        ) : (
          <>
            {status.configured && !url && (
              <div className="flex flex-wrap items-center gap-2">
                <p className="inline-flex items-center gap-2 rounded-md border bg-muted/50 p-3 text-sm">
                  <CheckCircle2 className="size-4 text-positive" />
                  {t("configured")}
                </p>
                {status.source === "env" && (
                  <span className="rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs text-warning">
                    {t("sourceEnv")}
                  </span>
                )}
              </div>
            )}

            {url && (
              <div className="space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input readOnly value={url} className="font-mono text-xs" />
                  <Button type="button" variant="outline" className="cursor-pointer" onClick={copy}>
                    <Copy className="size-4" />
                    {t("copy")}
                  </Button>
                </div>
                <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
                  {t("showOnce")}
                </p>
              </div>
            )}

            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
              <p>{t("howTo1")}</p>
              <p>{t("howTo2")}</p>
            </div>

            {/* Passo a passo aberto por clique, e não uma dica de passar o mouse:
                são cinco passos com nomes de botão de outro site — não cabem numa
                tooltip, e no celular não existe "passar o mouse". */}
            <Collapsible open={showSteps} onOpenChange={setShowSteps}>
              <CollapsibleTrigger className="flex cursor-pointer items-center gap-1.5 text-sm text-primary hover:underline">
                <ChevronDown
                  className={`size-4 transition-transform ${showSteps ? "rotate-180" : ""}`}
                />
                {t("stepsToggle")}
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <ol className="list-decimal space-y-2 rounded-lg border bg-muted/20 p-4 pl-8 text-sm">
                  <li>{t("step1")}</li>
                  <li>
                    {t("step2")}{" "}
                    <a
                      href="https://cron-job.org"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {/* i18n-ignore: cron-job.org é o endereço do serviço, igual nos 3 idiomas */}
                      cron-job.org
                    </a>
                  </li>
                  <li>{t("step3")}</li>
                  <li>{t("step4")}</li>
                  <li>{t("step5")}</li>
                </ol>
                <p className="pt-2 text-xs text-muted-foreground">{t("stepsNote")}</p>
              </CollapsibleContent>
            </Collapsible>

            <div className="flex flex-wrap gap-2">
              <Button type="button" className="cursor-pointer" disabled={working} onClick={generate}>
                {working ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <AlarmClock className="size-4" />
                )}
                {status.configured && status.source === "db" ? t("regenerate") : t("generate")}
              </Button>
              {status.configured && status.source === "db" && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="cursor-pointer"
                  disabled={working}
                  onClick={remove}
                >
                  <Trash2 className="size-4" />
                  {t("remove")}
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
