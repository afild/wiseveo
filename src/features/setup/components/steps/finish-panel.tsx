"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Copy, Eye, EyeOff, ExternalLink, Loader2, RefreshCw, Send, ShieldAlert } from "lucide-react"

export type SetupFinishMode = "auto-reload" | "restart-required" | "manual-env"

export interface SetupFinishState {
  mode: SetupFinishMode
  hosting?: "vercel" | "netlify" | "other"
  envVars?: Array<{ key: string; value: string }>
  /** Resultado do Telegram no Finalizar: conectado agora, ou fica para Configurações. */
  telegram?: { connected: boolean; deferred: boolean }
}

interface FinishPanelProps {
  state: SetupFinishState
  /** Consulta /api/setup/status; devolve true quando o app voltou configurado. */
  checkSetupComplete: () => Promise<boolean>
  onComplete: () => void
}

// i18n-ignore: URLs de painéis externos — dado, não texto de UI.
const HOSTING_LINKS = {
  vercel: "https://vercel.com/dashboard",
  netlify: "https://app.netlify.com/",
  other: null,
} as const

/**
 * Última tela do wizard, conforme o ambiente:
 * - auto-reload (dev): aguarda o Next recarregar e leva ao login;
 * - restart-required (self-host em produção): pede o reinício e aguarda;
 * - manual-env (Vercel & cia): mostra as variáveis para colar no painel e
 *   aguarda o redeploy — os segredos aparecem UMA vez, mascarados, e somem ao sair.
 */
export function FinishPanel({ state, checkSetupComplete, onComplete }: FinishPanelProps) {
  const t = useTranslations("setup.finish")
  const [polling, setPolling] = useState(state.mode !== "manual-env")
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!polling) return
    let cancelled = false
    const tick = async () => {
      if (cancelled) return
      const done = await checkSetupComplete().catch(() => false)
      if (cancelled) return
      if (done) {
        onComplete()
        return
      }
      timer.current = setTimeout(tick, state.mode === "manual-env" ? 5000 : 2000)
    }
    timer.current = setTimeout(tick, 2000)
    return () => {
      cancelled = true
      if (timer.current) clearTimeout(timer.current)
    }
    // checkSetupComplete/onComplete são estáveis o bastante (closures do wizard)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polling, state.mode])

  const envVars = state.envVars ?? []
  const envText = envVars.map(({ key, value }) => `${key}=${value}`).join("\n")

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(envText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setRevealed(true)
    }
  }

  const telegramNote = state.telegram ? (
    <p className="text-xs text-muted-foreground flex items-start gap-1.5 text-left">
      <Send className="size-3.5 mt-0.5 shrink-0 text-info" />
      <span>{state.telegram.connected ? t("telegramConnected") : t("telegramDeferred")}</span>
    </p>
  ) : null

  if (state.mode !== "manual-env") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 text-center animate-in fade-in duration-500 max-w-md w-full bg-background/80 backdrop-blur-md p-8 rounded-3xl border shadow-xl">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <h2 className="text-2xl font-bold">
          {state.mode === "auto-reload" ? t("autoReloadTitle") : t("restartTitle")}
        </h2>
        <p className="text-muted-foreground text-sm">
          {state.mode === "auto-reload" ? t("autoReloadDesc") : t("restartDesc")}
        </p>
        {state.mode === "restart-required" && (
          <code className="text-xs bg-muted px-2 py-1 rounded font-mono">{t("restartHintCommands")}</code>
        )}
        {telegramNote}
      </div>
    )
  }

  const hostingLink = HOSTING_LINKS[state.hosting ?? "other"]

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col gap-5 bg-background/80 backdrop-blur-md p-6 sm:p-8 rounded-3xl border shadow-xl animate-in fade-in duration-500">
      <div className="text-center">
        <div className="inline-flex p-3 rounded-xl bg-positive/10 border border-positive/20 mb-3">
          <CheckCircle2 className="w-6 h-6 text-positive" />
        </div>
        <h2 className="text-2xl font-bold">{t("manualTitle")}</h2>
        <p className="text-muted-foreground mt-1 text-sm">{t("manualSubtitle", { count: envVars.length })}</p>
      </div>

      <ol className="space-y-2 text-sm list-decimal list-inside">
        <li>
          {t("manualStep1")}{" "}
          {hostingLink && (
            <a
              href={hostingLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              {t("openHosting")}
              <ExternalLink className="size-3" />
            </a>
          )}
        </li>
        <li>{t("manualStep2")}</li>
        <li>{t("manualStep3")}</li>
      </ol>

      <div className="rounded-xl border bg-muted/20">
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b">
          <span className="text-xs font-medium text-muted-foreground">{t("envBlockLabel")}</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setRevealed((v) => !v)} className="gap-1.5">
              {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              {revealed ? t("hideValues") : t("showValues")}
            </Button>
            <Button variant="secondary" size="sm" onClick={copyAll} className="gap-1.5">
              {copied ? <CheckCircle2 className="size-3.5 text-positive" /> : <Copy className="size-3.5" />}
              {copied ? t("copied") : t("copyAll")}
            </Button>
          </div>
        </div>
        <pre className="text-xs font-mono p-3 overflow-x-auto whitespace-pre leading-relaxed">
          {envVars.map(({ key, value }) => (
            <div key={key}>
              <span className="text-primary">{key}</span>=<span>{revealed ? value : "•".repeat(Math.min(24, Math.max(8, value.length)))}</span>
            </div>
          ))}
        </pre>
      </div>

      <p className="text-xs text-muted-foreground flex items-start gap-1.5">
        <ShieldAlert className="size-3.5 mt-0.5 shrink-0 text-warning" />
        <span>{t("secretsWarning")}</span>
      </p>

      {telegramNote}

      {polling ? (
        <div className="rounded-xl border bg-muted/20 p-4 flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
          <div className="text-sm">
            <p className="font-medium">{t("waitingRedeployTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("waitingRedeployDesc")}</p>
          </div>
        </div>
      ) : (
        <Button size="lg" onClick={() => setPolling(true)} className="w-full">
          <RefreshCw className="w-4 h-4 mr-2" />
          {t("redeployDone")}
        </Button>
      )}
    </div>
  )
}
