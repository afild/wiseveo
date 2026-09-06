"use client"

import React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Bot, CheckCircle2, Database, Loader2, Unplug } from "lucide-react"
import {
  ADVISOR_MESSAGES_TABLE,
  AI_USAGE_TABLE,
  APP_SETTINGS_TABLE,
  INTEGRATION_TABLES,
  KPI_SNAPSHOTS_TABLE,
  NOTIFICATION_DELIVERIES_TABLE,
  type AppSettingsStructure,
  type IntegrationTable,
} from "../lib/app-settings-structure"
import { AiSettingsCard, type AiSettingsSnapshot } from "./ai-settings-card"
import { TickSettingsCard, type TickSecretView } from "./tick-settings-card"
import { BackupSettingsCard, type BackupSettingsView } from "./backup-settings-card"

/**
 * Cada tabela tem a SUA explicação na lista do que falta. Mapa explícito para
 * que acrescentar uma tabela nova sem escrever o texto dela quebre no TypeScript
 * — e não apareça em silêncio com a descrição de outra peça.
 */
const PIECE_LABEL_KEYS = {
  [APP_SETTINGS_TABLE]: "prepare.pieceTable",
  [AI_USAGE_TABLE]: "prepare.pieceUsage",
  [ADVISOR_MESSAGES_TABLE]: "prepare.pieceAdvisor",
  [NOTIFICATION_DELIVERIES_TABLE]: "prepare.pieceDeliveries",
  [KPI_SNAPSHOTS_TABLE]: "prepare.pieceSnapshots",
} as const satisfies Record<IntegrationTable, string>

export interface TelegramBotSummary {
  configured: boolean
  source: "db" | "env" | null
  botUsername: string | null
}

interface IntegrationsFormProps {
  /** null = leitura falhou no servidor; o preparo continua disponível e explica. */
  initialStructure: AppSettingsStructure | null
  initialBot: TelegramBotSummary
  /** null = leitura falhou; o cartão de IA fica de fora nesta visita. */
  initialAi: AiSettingsSnapshot | null
  /** null = leitura falhou; o cartão do despertador fica de fora nesta visita. */
  initialTick: TickSecretView | null
  /** null = leitura falhou; o cartão de backup fica de fora nesta visita. */
  initialBackup: BackupSettingsView | null
  /** Demo ilustrativa: campos e ações travados; nada chama o servidor. */
  readOnly?: boolean
}

/**
 * Configurações → Integrações (só SUPERADMIN; a demo nem monta a aba). Duas peças:
 * o cartão "Preparar meu banco" (cria a tabela cifrada `app_settings`, com
 * confirmação — padrão dos convites) e o cartão do bot do Telegram ("cole só o
 * token": o app valida, gera o segredo e registra o webhook sozinho).
 * O VÍNCULO de cada pessoa continua em Conta → Telegram — aqui é o bot da casa.
 */
export function IntegrationsForm({
  initialStructure,
  initialBot,
  initialAi,
  initialTick,
  initialBackup,
  readOnly = false,
}: IntegrationsFormProps) {
  const t = useTranslations("settings.integrations")
  const tCommon = useTranslations("common")
  const [structure, setStructure] = React.useState(initialStructure)
  const [bot, setBot] = React.useState(initialBot)
  const [token, setToken] = React.useState("")
  const [preparing, setPreparing] = React.useState(false)
  const [confirmPrepare, setConfirmPrepare] = React.useState(false)
  const [connecting, setConnecting] = React.useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = React.useState(false)
  const [disconnecting, setDisconnecting] = React.useState(false)

  // "Tudo pronto" decide o cartão de preparar; guardar token/chave depende só da
  // tabela de segredos (o medidor de IA pode faltar sem travar nada).
  const ready = structure?.ready === true
  const secretsReady = structure?.secretsReady === true

  async function prepare() {
    setPreparing(true)
    try {
      const response = await fetch("/api/admin/app-settings", { method: "POST" })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) throw new Error(payload?.message ?? t("prepare.error"))
      setStructure(payload.data)
      toast.success(t("prepare.readyTitle"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("prepare.error"))
    } finally {
      setPreparing(false)
      setConfirmPrepare(false)
    }
  }

  async function connectBot() {
    setConnecting(true)
    try {
      const response = await fetch("/api/admin/telegram-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) throw new Error(payload?.message ?? t("bot.error"))
      setBot({ configured: true, source: "db", botUsername: payload.data.botUsername })
      setToken("")
      toast.success(t("bot.connectSuccess", { username: payload.data.botUsername }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("bot.error"))
    } finally {
      setConnecting(false)
    }
  }

  async function disconnectBot() {
    setDisconnecting(true)
    try {
      const response = await fetch("/api/admin/telegram-bot", { method: "DELETE" })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) throw new Error(payload?.message ?? t("bot.error"))
      // Estado REAL devolvido pelo servidor: se as envs TELEGRAM_* ainda existirem,
      // o bot delas volta a valer — mostrar isso, não um "desconectado" de fachada.
      const status: TelegramBotSummary = payload.data ?? { configured: false, source: null, botUsername: null }
      setBot(status)
      toast.success(status.configured ? t("bot.disconnectEnvFallback") : t("bot.disconnectSuccess"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("bot.error"))
    } finally {
      setDisconnecting(false)
      setConfirmDisconnect(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* O banco precisa da tabela cifrada — só entra com a confirmação do dono. */}
      {!ready && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Database className="size-4" />
              {t("prepare.title")}
            </CardTitle>
            <CardDescription>{t("prepare.desc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-1.5 text-sm">
              {(structure?.missing ?? [...INTEGRATION_TABLES]).map((table) => (
                <li key={table} className="flex items-start gap-2">
                  <Database className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <span>{t(PIECE_LABEL_KEYS[table])}</span>
                </li>
              ))}
            </ul>
            <p className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              {t("prepare.safety")}
            </p>
            <Button
              type="button"
              className="cursor-pointer"
              disabled={preparing}
              onClick={() => setConfirmPrepare(true)}
            >
              <Database className="size-4" />
              {preparing ? t("prepare.preparing") : t("prepare.prepare")}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bot className="size-4 text-info" />
            {t("bot.title")}
          </CardTitle>
          <CardDescription>{t("bot.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {bot.configured && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="inline-flex items-center gap-2 rounded-md border bg-muted/50 p-3 text-sm">
                <CheckCircle2 className="size-4 text-positive" />
                <span>
                  {t("bot.connectedAs")}{" "}
                  <span className="font-semibold">@{bot.botUsername}</span>
                </span>
              </p>
              {bot.source === "env" && (
                <span className="rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs text-warning">
                  {t("bot.sourceEnv")}
                </span>
              )}
            </div>
          )}

          {!secretsReady ? (
            <p className="text-sm text-muted-foreground">{t("bot.needsPrepare")}</p>
          ) : (
            <>
              {!bot.configured && (
                <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                  <p>
                    {t("bot.howTo1")}{" "}
                    <a
                      href="https://t.me/BotFather"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {/* i18n-ignore: @BotFather é o nome próprio do bot oficial do Telegram, igual nos 3 idiomas */}
                      @BotFather
                    </a>
                  </p>
                  <p>{t("bot.howTo2")}</p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="telegram-bot-token" className="text-sm">
                  {bot.configured ? t("bot.replaceLabel") : t("bot.tokenLabel")}
                </Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="telegram-bot-token"
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                    className="font-mono text-xs"
                    disabled={readOnly}
                  />
                  <Button
                    type="button"
                    className="cursor-pointer"
                    disabled={!token.trim() || connecting || readOnly}
                    onClick={connectBot}
                  >
                    {connecting ? <Loader2 className="size-4 animate-spin" /> : <Bot className="size-4" />}
                    {connecting ? t("bot.connecting") : t("bot.connect")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t("bot.autoNote")}</p>
              </div>
              {bot.configured && bot.source === "db" && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="cursor-pointer"
                  disabled={disconnecting || readOnly}
                  onClick={() => setConfirmDisconnect(true)}
                >
                  <Unplug className="size-4" />
                  {t("bot.disconnect")}
                </Button>
              )}
            </>
          )}

          <p className="text-xs text-muted-foreground">{t("bot.personalHint")}</p>
        </CardContent>
      </Card>

      {initialAi && (
        <AiSettingsCard structureReady={secretsReady} initial={initialAi} readOnly={readOnly} />
      )}

      {initialTick && (
        <TickSettingsCard structureReady={secretsReady} initial={initialTick} readOnly={readOnly} />
      )}

      {initialBackup && (
        <BackupSettingsCard
          structureReady={secretsReady}
          tickConfigured={initialTick?.configured === true}
          initial={initialBackup}
          readOnly={readOnly}
        />
      )}

      <AlertDialog open={confirmPrepare} onOpenChange={(open) => !open && setConfirmPrepare(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("prepare.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("prepare.confirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction className="cursor-pointer" onClick={prepare} disabled={preparing}>
              {t("prepare.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDisconnect} onOpenChange={(open) => !open && setConfirmDisconnect(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("bot.disconnectConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("bot.disconnectConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction className="cursor-pointer" onClick={disconnectBot} disabled={disconnecting}>
              {t("bot.disconnectConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
