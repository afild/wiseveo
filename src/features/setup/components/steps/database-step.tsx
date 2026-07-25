"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Database,
  Server,
  CheckCircle2,
  XCircle,
  Loader2,
  Container,
  PlugZap,
  Info,
  HelpCircle
} from "lucide-react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

interface DatabaseStepProps {
  connectionString: string
  onConnectionStringChange: (value: string) => void
  useExistingData: boolean
  onUseExistingDataChange: (value: boolean) => void
  onExistingChartChange: (value: { groups: any[], accounts: any[] } | null) => void
  onNext: () => void
  onBack: () => void
}

type ConnectionStatus = "idle" | "testing" | "success" | "error"
interface AuditResult {
  accounts: number
  transactions: number
  categories: number
  groups: number
}

export function DatabaseStep({


  connectionString,
  onConnectionStringChange,
  useExistingData,
  onUseExistingDataChange,
  onExistingChartChange,
  onNext,
  onBack,
}: DatabaseStepProps) {
  const t = useTranslations("setup.database")
  const tc = useTranslations("setup.common")
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle")
  const [errorMessage, setErrorMessage] = useState("")
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null)

  const handleUseDocker = () => {
    onConnectionStringChange("postgresql://postgres:postgres@localhost:5432/wiseveo?schema=public")
    onUseExistingDataChange(false)
    onExistingChartChange(null)
    setConnectionStatus("idle")
    setAuditResult(null)
  }

  const handleTestConnection = async () => {
    if (!connectionString.trim()) return
    setConnectionStatus("testing")
    setErrorMessage("")
    setAuditResult(null)
    onExistingChartChange(null)

    try {
      const res = await fetch("/api/setup/test-db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionString }),
      })
      const data = await res.json()

      if (data.success) {
        setConnectionStatus("success")
        if (data.hasData && data.audit) {
          setAuditResult(data.audit)
          onUseExistingDataChange(true)
          if (data.audit.existingChart) {
            onExistingChartChange(data.audit.existingChart)
          }
        } else {
          onUseExistingDataChange(false)
          onExistingChartChange(null)
        }
      } else {
        setConnectionStatus("error")
        setErrorMessage(data.message || t("cantConnect"))
      }
    } catch {
      setConnectionStatus("error")
      setErrorMessage(t("networkError"))
    }
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="text-center">
        <div className="inline-flex p-3 rounded-xl bg-primary/10 border border-primary/20 mb-3">
          <Database className="w-6 h-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">{t("title")}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("subtitle")}
        </p>
      </div>

      {/* Quick Options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={handleUseDocker}
          className="flex items-center gap-3 p-4 rounded-xl border-2 border-muted hover:border-primary/50 transition-all text-left cursor-pointer"
        >
          <Container className="w-8 h-8 text-info shrink-0" />
          <div>
            <p className="font-medium text-sm">{t("dockerTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("dockerSubtitle")}</p>
          </div>
        </button>
        <button
          onClick={() => {
            onConnectionStringChange("")
            setConnectionStatus("idle")
            setAuditResult(null)
            onExistingChartChange(null)
          }}
          className="flex items-center gap-3 p-4 rounded-xl border-2 border-muted hover:border-primary/50 transition-all text-left cursor-pointer"
        >
          <PlugZap className="w-8 h-8 text-positive shrink-0" />
          <div>
            <p className="font-medium text-sm">{t("existingTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("existingSubtitle")}</p>
          </div>
        </button>
      </div>

      {/* Connection String Input */}
      <div className="space-y-2">
        <Label htmlFor="db-url" className="text-sm font-medium">
          {t("connectionString")}
        </Label>
        <Input
          id="db-url"
          value={connectionString}
          onChange={(e) => {
            onConnectionStringChange(e.target.value)
            setConnectionStatus("idle")
            setAuditResult(null)
            onExistingChartChange(null)
          }}
          placeholder={t("connectionPlaceholder")}
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Info className="w-3 h-3" />
          {t("format")}
        </p>

        {/* Mini Tutorial */}
        <Accordion type="single" collapsible className="w-full mt-2 border rounded-lg px-4 bg-muted/20">
          <AccordionItem value="help" className="border-b-0">
            <AccordionTrigger className="py-3 text-xs text-muted-foreground hover:no-underline">
              <span className="flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-primary" />
                {t("helpTitle")}
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-xs text-muted-foreground space-y-3 pb-4">
              <div>
                <strong className="text-foreground">{t("supabaseLabel")}</strong>
                <ol className="list-decimal list-inside mt-1 space-y-1 ml-1">
                  <li>{t("helpSupabase").split(". ")[0]}</li>
                  <li>{t.rich("helpSupabaseStep2", { strong: (chunks) => <strong>{chunks}</strong> })}</li>
                  <li>{t.rich("helpSupabaseStep3", { strong: (chunks) => <strong>{chunks}</strong> })}</li>
                  <li>{t.rich("helpSupabaseStep4", { code: (chunks) => <code className="bg-muted px-1 rounded">{chunks}</code> })}</li>
                </ol>
              </div>
              <div>
                <strong className="text-foreground">{t("neonLabel")}</strong>
                <p className="mt-1 ml-1 leading-relaxed text-muted-foreground">{t("helpNeon")}</p>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* Test Connection Button */}
      <Button
        onClick={handleTestConnection}
        disabled={!connectionString.trim() || connectionStatus === "testing"}
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

      {/* Connection Result */}
      {connectionStatus === "success" && (
        <div className="rounded-xl border border-positive/30 bg-positive/5 p-4 animate-in fade-in duration-300">
          <div className="flex items-center gap-2 text-positive font-medium">
            <CheckCircle2 className="w-5 h-5" />
            {t("success")}
          </div>

          {auditResult && (
            <div className="mt-3 space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                {t("existingDataFound")}
              </p>
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
              <p className="text-xs text-muted-foreground italic">
                {t("preserveDataMsg")}
              </p>
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

      {/* Navigation */}
      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onBack} className="flex-1">
          {tc("back")}
        </Button>
        <Button
          onClick={onNext}
          disabled={connectionStatus !== "success"}
          className="flex-1"
        >
          {tc("next")}
        </Button>
      </div>
    </div>
  )
}
