"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { CheckCircle2, ChevronDown, CloudUpload, ExternalLink, HardDriveDownload, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { createDateFormatter, createNumberFormatter } from "@/i18n/format"
import type { BackupSettingsView } from "@/features/backup/services/backup-config.service"
import type { BackupFile } from "@/features/backup/lib/backup-retention"

export type { BackupSettingsView }

interface BackupSettingsCardProps {
  /** Sem a tabela de segredos não há onde guardar a pasta nem o resultado. */
  structureReady: boolean
  /** Sem despertador cadastrado o backup automático nunca dispara. */
  tickConfigured: boolean
  initial: BackupSettingsView
  /** Demo ilustrativa: tudo travado; nada chama o servidor. */
  readOnly?: boolean
}

const MINUTES = [0, 15, 30, 45] as const

export function BackupSettingsCard({ structureReady, tickConfigured, initial, readOnly = false }: BackupSettingsCardProps) {
  const t = useTranslations("settings.integrations.backup")
  const locale = useLocale()
  const [view, setView] = React.useState(initial)
  const [enabled, setEnabled] = React.useState(initial.enabled)
  const [hour, setHour] = React.useState(initial.hour)
  const [minute, setMinute] = React.useState<(typeof MINUTES)[number]>(initial.minute)
  const [keep, setKeep] = React.useState(initial.keep)
  const [files, setFiles] = React.useState<BackupFile[] | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [running, setRunning] = React.useState(false)
  const [showRestore, setShowRestore] = React.useState(false)

  const formatDate = React.useMemo(() => createDateFormatter(locale, { dateStyle: "medium", timeStyle: "short" }), [locale])
  const formatNumber = React.useMemo(() => createNumberFormatter(locale, { maximumFractionDigits: 1 }), [locale])
  const size = (bytes: number) => (bytes >= 1024 * 1024 ? `${formatNumber.format(bytes / (1024 * 1024))} MB` : `${formatNumber.format(bytes / 1024)} KB`)

  // Volta do consentimento: ?backup=connected | scope_missing | google_denied | ...
  React.useEffect(() => {
    if (readOnly) return
    const outcome = new URLSearchParams(window.location.search).get("backup")
    if (!outcome) return
    if (outcome === "connected") toast.success(t("connectedToast"))
    else if (outcome === "scope_missing") toast.error(t("errorScopeMissing"))
    else toast.error(t("errorGeneric"))
    const url = new URL(window.location.href)
    url.searchParams.delete("backup")
    window.history.replaceState({}, "", url.toString())
  }, [readOnly, t])

  const load = React.useCallback(async () => {
    if (readOnly) return
    try {
      const response = await fetch("/api/admin/backup")
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success || !payload.data) return
      setView(payload.data)
      setFiles(payload.data.files ?? [])
    } catch {
      // A lista é cortesia; o cartão continua utilizável sem ela.
    }
  }, [readOnly])

  // A lista só é buscada depois que o Drive está ligado. A chamada vai dentro de uma função
  // assíncrona anônima de propósito: `load()` solto no corpo do efeito é lido pelo
  // `react-hooks/set-state-in-effect` como estado mudando na hora, e aqui ele só muda depois
  // da resposta do servidor.
  React.useEffect(() => {
    if (!view.driveConnected) return
    void (async () => {
      await load()
    })()
  }, [view.driveConnected, load])

  async function save() {
    setSaving(true)
    try {
      const response = await fetch("/api/admin/backup", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, hour, minute, keep }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) throw new Error(payload?.message ?? t("error"))
      toast.success(t("saved"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("error"))
    } finally {
      setSaving(false)
    }
  }

  async function runNow() {
    setRunning(true)
    try {
      const response = await fetch("/api/admin/backup", { method: "POST" })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) throw new Error(payload?.message ?? t("error"))
      // A rota devolve 200 tambem quando nada foi gerado (`outcome: "skipped"`), por
      // exemplo em dois cliques no mesmo minuto, que colidem na reserva do dia. Sem esta
      // checagem o cartao anunciava "Backup feito: , 0 KB".
      const data = payload.data as { outcome?: string; fileName?: string; sizeBytes?: number }
      if (data.outcome !== "sent") {
        toast.warning(t("runNowSkipped"))
        return
      }
      toast.success(t("runNowDone", { file: data.fileName ?? "", size: size(data.sizeBytes ?? 0) }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("error"))
    } finally {
      setRunning(false)
      // Recarrega em TODOS os caminhos, inclusive na falha. O servidor grava o resultado
      // (`recordLastRun`) mesmo quando o backup quebra, e sem esta linha o cartao seguia
      // dizendo "Ainda nao rodou" depois de uma tentativa que falhou: o aviso aparecia so
      // no toast, que some. O criterio 3 do desenho pede que a falha fique visivel no cartao.
      await load()
    }
  }

  const folderUrl = view.folderId ? `https://drive.google.com/drive/folders/${view.folderId}` : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CloudUpload className="size-4 text-info" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("desc")}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!structureReady ? (
          <p className="text-sm text-muted-foreground">{t("needsPrepare")}</p>
        ) : (
          <fieldset disabled={readOnly} className="space-y-4">
            {view.driveConnected ? (
              <p className="inline-flex items-center gap-2 rounded-md border bg-muted/50 p-3 text-sm">
                <CheckCircle2 className="size-4 text-positive" />
                {t("connected")}
              </p>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="cursor-pointer"
                onClick={() => {
                  window.location.href = "/api/admin/backup/connect-google"
                }}
              >
                <HardDriveDownload className="size-4" />
                {t("connect")}
              </Button>
            )}

            {!tickConfigured && <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">{t("needsTick")}</p>}

            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="backup-enabled">{t("enabled")}</Label>
              <Switch id="backup-enabled" checked={enabled} onCheckedChange={setEnabled} disabled={!view.driveConnected} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("hour")}</Label>
                <div className="flex gap-2">
                  <Select value={String(hour)} onValueChange={(v) => setHour(Number(v))}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, h) => (
                        <SelectItem key={h} value={String(h)}>{String(h).padStart(2, "0")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={String(minute)} onValueChange={(v) => setMinute(Number(v) as (typeof MINUTES)[number])}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MINUTES.map((m) => (
                        <SelectItem key={m} value={String(m)}>{String(m).padStart(2, "0")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">{t("hourHint", { timezone: view.timezone })}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="backup-keep">{t("keep")}</Label>
                <Input id="backup-keep" type="number" min={7} max={365} value={keep} onChange={(e) => setKeep(Number(e.target.value))} />
                <p className="text-xs text-muted-foreground">{t("keepHint")}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" className="cursor-pointer" disabled={saving || running} onClick={save}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                {saving ? t("saving") : t("save")}
              </Button>
              <Button type="button" variant="outline" className="cursor-pointer" disabled={running || saving || !view.driveConnected} onClick={runNow}>
                {running ? <Loader2 className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}
                {t("runNow")}
              </Button>
            </div>
            {running && <p className="text-xs text-muted-foreground">{t("running")}</p>}

            <div className="space-y-1 text-sm">
              <p className="font-medium">{t("lastRun")}</p>
              {!view.lastRun ? (
                <p className="text-muted-foreground">{t("lastRunNever")}</p>
              ) : view.lastRun.ok ? (
                <p className="text-muted-foreground">
                  {t("lastRunOk", { date: formatDate.format(new Date(view.lastRun.at)), file: view.lastRun.fileName ?? "", size: size(view.lastRun.sizeBytes ?? 0) })}
                </p>
              ) : (
                <p className="text-destructive">{t("lastRunFailed", { date: formatDate.format(new Date(view.lastRun.at)), reason: view.lastRun.message ?? "" })}</p>
              )}
            </div>

            {/* `files` so deixa de ser null quando a lista chega do servidor. Sem esta
                condicao, o titulo aparecia sozinho enquanto o GET nao voltava, e ficava
                orfao para sempre na demo, que nunca chama o servidor. */}
            {view.driveConnected && files !== null && (
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{t("files")}</p>
                  {folderUrl && (
                    <a href={folderUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline">
                      {t("openFolder")}
                      <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
                {files.length === 0 ? (
                  <p className="text-muted-foreground">{t("filesEmpty")}</p>
                ) : (
                  <ul className="divide-y rounded-md border text-xs">
                    {files.slice(0, 10).map((file) => (
                      <li key={file.id} className="flex items-center justify-between gap-2 px-3 py-2">
                        <span className="font-mono">{file.name}</span>
                        <span className="text-muted-foreground">{formatDate.format(new Date(file.createdAt))} · {size(file.sizeBytes)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <Collapsible open={showRestore} onOpenChange={setShowRestore}>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="cursor-pointer px-0 text-muted-foreground">
                  <ChevronDown className={`size-4 transition-transform ${showRestore ? "rotate-180" : ""}`} />
                  {t("restoreToggle")}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">{t("restoreTitle")}</p>
                  <p>1. {t("restoreStep1")}</p>
                  <p>2. {t("restoreStep2")}</p>
                  <p>3. {t("restoreStep3")}</p>
                  <p>4. {t("restoreStep4")}</p>
                  <p>5. {t("restoreStep5")}</p>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </fieldset>
        )}
      </CardContent>
    </Card>
  )
}
