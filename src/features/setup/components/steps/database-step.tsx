"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Database, CheckCircle2, XCircle, Loader2, Container, PlugZap, Sparkles, Server } from "lucide-react"
import { SupabaseManagedPanel } from "./database/supabase-managed-panel"
import { ConnectionUrlPanel } from "./database/connection-url-panel"

interface DatabaseStepProps {
  connectionString: string
  onConnectionStringChange: (value: string) => void
  useExistingData: boolean
  onUseExistingDataChange: (value: boolean) => void
  onExistingChartChange: (value: ExistingChart | null) => void
  onNext: () => void
  onBack: () => void
}

type ExistingChart = { groups: unknown[]; accounts: unknown[] }
type Path = "managed" | "url" | "docker"
type ConnectionStatus = "idle" | "testing" | "success" | "error"
interface AuditResult {
  accounts: number
  transactions: number
  categories: number
  groups: number
  existingChart?: ExistingChart
}

// i18n-ignore: URL técnica do banco local do docker-compose (dado, não texto de UI)
const DOCKER_URL = "postgresql://postgres:postgres@localhost:5432/wiseveo?schema=public"

/**
 * Passo "Banco de dados" do wizard: três caminhos (criar/conectar com token,
 * colar a URL, Docker local). O teste de conexão e o resultado são únicos
 * para os três; o Avançar só libera depois de uma conexão bem-sucedida.
 */
export function DatabaseStep({
  connectionString,
  onConnectionStringChange,
  onUseExistingDataChange,
  onExistingChartChange,
  onNext,
  onBack,
}: DatabaseStepProps) {
  const t = useTranslations("setup.database")
  const tc = useTranslations("setup.common")
  const [path, setPath] = useState<Path>("managed")
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle")
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState("")
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null)

  const resetResult = () => {
    setConnectionStatus("idle")
    setErrorCode(null)
    setErrorMessage("")
    setAuditResult(null)
    onExistingChartChange(null)
  }

  const choosePath = (next: Path) => {
    setPath(next)
    resetResult()
    onConnectionStringChange(next === "docker" ? DOCKER_URL : "")
    onUseExistingDataChange(false)
  }

  /** Testa uma URL no servidor e atualiza o resultado; devolve se conectou. */
  const runConnectionTest = async (url: string): Promise<boolean> => {
    if (!url.trim()) return false
    setConnectionStatus("testing")
    setErrorCode(null)
    setErrorMessage("")
    setAuditResult(null)
    onExistingChartChange(null)

    try {
      const res = await fetch("/api/setup/test-db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionString: url }),
      })
      const data = await res.json()

      if (data.success) {
        setConnectionStatus("success")
        if (data.hasData && data.audit) {
          setAuditResult(data.audit)
          onUseExistingDataChange(true)
          if (data.audit.existingChart) onExistingChartChange(data.audit.existingChart)
        } else {
          onUseExistingDataChange(false)
          onExistingChartChange(null)
        }
        return true
      }
      setConnectionStatus("error")
      setErrorCode(data.code ?? null)
      setErrorMessage(data.message || t("cantConnect"))
      return false
    } catch {
      setConnectionStatus("error")
      setErrorMessage(t("networkError"))
      return false
    }
  }

  const paths: Array<{ id: Path; icon: React.ReactNode; title: string; subtitle: string; badge?: string }> = [
    {
      id: "managed",
      icon: <Sparkles className="w-7 h-7 text-primary shrink-0" />,
      title: t("pathManaged"),
      subtitle: t("pathManagedDesc"),
      badge: t("pathManagedBadge"),
    },
    {
      id: "url",
      icon: <PlugZap className="w-7 h-7 text-positive shrink-0" />,
      title: t("pathUrl"),
      subtitle: t("pathUrlDesc"),
    },
    {
      id: "docker",
      icon: <Container className="w-7 h-7 text-info shrink-0" />,
      title: t("dockerTitle"),
      subtitle: t("dockerSubtitle"),
    },
  ]

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="text-center">
        <div className="inline-flex p-3 rounded-xl bg-primary/10 border border-primary/20 mb-3">
          <Database className="w-6 h-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">{t("title")}</h2>
        <p className="text-muted-foreground mt-1 text-sm">{t("subtitle")}</p>
      </div>

      {/* Escolha do caminho */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {paths.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => choosePath(p.id)}
            className={`relative flex flex-col items-start gap-2 p-4 rounded-xl border-2 transition-all text-left cursor-pointer ${
              path === p.id ? "border-primary bg-primary/5 shadow-sm" : "border-muted hover:border-primary/40"
            }`}
          >
            {p.badge && (
              <span className="absolute top-2 right-2 rounded-full bg-primary/10 text-primary text-[10px] font-semibold px-2 py-0.5 uppercase tracking-wide">
                {p.badge}
              </span>
            )}
            {p.icon}
            <div>
              <p className="font-medium text-sm">{p.title}</p>
              <p className="text-xs text-muted-foreground">{p.subtitle}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Painel do caminho escolhido */}
      {path === "managed" && <SupabaseManagedPanel testConnection={runConnectionTest} />}

      {path === "url" && (
        <ConnectionUrlPanel
          onConnectionStringChange={(value) => {
            onConnectionStringChange(value)
            if (connectionStatus !== "idle") resetResult()
          }}
          onTest={() => runConnectionTest(connectionString)}
          testing={connectionStatus === "testing"}
          errorCode={errorCode}
        />
      )}

      {path === "docker" && (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border bg-muted/20 p-4 space-y-2">
            <p className="text-sm">{t("dockerNote")}</p>
            <code className="block text-xs bg-muted px-2 py-1.5 rounded font-mono break-all">{DOCKER_URL}</code>
          </div>
          <Button
            onClick={() => runConnectionTest(DOCKER_URL)}
            disabled={connectionStatus === "testing"}
            variant="outline"
            className="w-full"
          >
            {connectionStatus === "testing" ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t("testing")}
              </>
            ) : (
              <>
                <Server className="w-4 h-4 mr-2" />
                {t("testConnection")}
              </>
            )}
          </Button>
        </div>
      )}

      {/* Resultado */}
      {connectionStatus === "success" && (
        <div className="rounded-xl border border-positive/30 bg-positive/5 p-4 animate-in fade-in duration-300">
          <div className="flex items-center gap-2 text-positive font-medium">
            <CheckCircle2 className="w-5 h-5" />
            {t("success")}
          </div>

          {auditResult && (
            <div className="mt-3 space-y-2">
              <p className="text-sm font-medium text-muted-foreground">{t("existingDataFound")}</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-background/50 p-2.5 text-center">
                  <p className="text-lg font-bold">{auditResult.accounts}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("accounts")}</p>
                </div>
                <div className="rounded-lg bg-background/50 p-2.5 text-center">
                  <p className="text-lg font-bold">{auditResult.transactions.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("transactions")}</p>
                </div>
                <div className="rounded-lg bg-background/50 p-2.5 text-center">
                  <p className="text-lg font-bold">{auditResult.groups}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("groups")}</p>
                </div>
                <div className="rounded-lg bg-background/50 p-2.5 text-center">
                  <p className="text-lg font-bold">{auditResult.categories}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("categories")}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground italic">{t("preserveDataMsg")}</p>
            </div>
          )}
        </div>
      )}

      {connectionStatus === "error" && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 animate-in fade-in duration-300">
          <div className="flex items-center gap-2 text-destructive font-medium">
            <XCircle className="w-5 h-5" />
            {t("connectionFailed")}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{errorMessage}</p>
        </div>
      )}

      {/* Navegação */}
      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onBack} className="flex-1">
          {tc("back")}
        </Button>
        <Button onClick={onNext} disabled={connectionStatus !== "success"} className="flex-1">
          {tc("next")}
        </Button>
      </div>
    </div>
  )
}
