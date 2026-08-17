"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { WizardStepper } from "./wizard-stepper"
import { WelcomeStep } from "./steps/welcome-step"
import { DatabaseStep } from "./steps/database-step"
import { AdminStep } from "./steps/admin-step"
import { IntegrationsStep } from "./steps/integrations-step"
import { ChartOfAccountsStep } from "./steps/chart-of-accounts-step"
import { SummaryStep } from "./steps/summary-step"
import { FinishPanel, type SetupFinishState } from "./steps/finish-panel"
import { Globe, Database, UserPlus, Puzzle, LayoutList, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { useLocale, useTranslations } from "next-intl"
import { resolveAppLocale, type AppLocale } from "@/i18n/config"

interface SetupWizardProps {
  /** Instalação já configurada: SUPERADMIN refazendo o setup (testes de conexão/interface). */
  reconfiguring?: boolean
}

export function SetupWizard({ reconfiguring = false }: SetupWizardProps) {
  const router = useRouter()
  const t = useTranslations("setup")
  // Idioma em que a página foi renderizada (cookie → env da instalação → en-US):
  // o card destacado no passo de boas-vindas deve coincidir com ele.
  const renderedLocale = resolveAppLocale(useLocale())
  const [currentStep, setCurrentStep] = useState(0)
  const [isConfiguring, setIsConfiguring] = useState(false)
  // Tela final: depende de como este ambiente persiste a configuração
  // (dev recarrega sozinho; self-host precisa reiniciar; Vercel precisa colar variáveis).
  const [finishState, setFinishState] = useState<SetupFinishState | null>(null)

  // Global State
  const [locale, setLocale] = useState<AppLocale>(renderedLocale)
  const [connectionString, setConnectionString] = useState("")
  const [useExistingData, setUseExistingData] = useState(false)
  const [existingChartOfAccounts, setExistingChartOfAccounts] = useState<{ groups: any[], accounts: any[] } | null>(null)
  const [admin, setAdmin] = useState({ name: "", email: "", password: "", confirmPassword: "" })
  const [integrations, setIntegrations] = useState({
    google: { enabled: false, clientId: "", clientSecret: "" },
    telegram: { enabled: false, botToken: "", botUsername: "", webhookSecret: "" },
    openai: { enabled: false, apiKey: "" },
  })
  
  // Future: the chart of accounts step will mutate this state if customized
  // Currently, we'll let the backend use the defaults if we don't pass a custom one yet,
  // but the UI step is ready for it.
  
  const steps = [
    { label: t("stepper.welcome"), icon: <Globe className="w-5 h-5" /> },
    { label: t("stepper.database"), icon: <Database className="w-5 h-5" /> },
    { label: t("stepper.admin"), icon: <UserPlus className="w-5 h-5" /> },
    { label: t("stepper.integrations"), icon: <Puzzle className="w-5 h-5" /> },
    { label: t("stepper.chartOfAccounts"), icon: <LayoutList className="w-5 h-5" /> },
    { label: t("stepper.summary"), icon: <CheckCircle2 className="w-5 h-5" /> },
  ]

  const handleNext = () => setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1))
  const handleBack = () => setCurrentStep((prev) => Math.max(prev - 1, 0))

  const handleIntegrationChange = (integration: string, field: string, value: string | boolean) => {
    setIntegrations((prev) => ({
      ...prev,
      [integration]: {
        ...prev[integration as keyof typeof prev],
        [field]: value,
      },
    }))
  }

  const handleAdminChange = (field: string, value: string) => {
    setAdmin((prev) => ({ ...prev, [field]: value }))
  }

  const handleFinish = async () => {
    setIsConfiguring(true)
    try {
      const payload = {
        databaseUrl: connectionString,
        useExistingData,
        admin,
        locale,
        integrations,
        // The backend will generate authSecret
      }

      const res = await fetch("/api/setup/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      
      const data = await res.json().catch(() => ({ success: false }))

      if (data.success) {
        // Segredos já estão no servidor (ou na tela final, para copiar UMA vez):
        // nada deles sobra no estado do wizard.
        setConnectionString("")
        setAdmin((prev) => ({ ...prev, password: "", confirmPassword: "" }))
        setIntegrations({
          google: { enabled: false, clientId: "", clientSecret: "" },
          telegram: { enabled: false, botToken: "", botUsername: "", webhookSecret: "" },
          openai: { enabled: false, apiKey: "" },
        })
        setFinishState({
          mode: data.mode ?? "auto-reload",
          hosting: data.hosting,
          envVars: Array.isArray(data.envVars) ? data.envVars : undefined,
        })
        toast.success(t("wizard.success"))
      } else {
        toast.error(data.message || t("wizard.error"))
        setIsConfiguring(false)
      }
    } catch (error) {
      console.error(error)
      toast.error(t("wizard.fatalError"))
      setIsConfiguring(false)
    }
  }

  const checkSetupComplete = async (): Promise<boolean> => {
    // Falha (servidor reiniciando / redeploy em andamento) conta como "ainda não".
    const res = await fetch("/api/setup/status", { cache: "no-store" })
    if (!res.ok) return false
    const data = await res.json()
    return data.setupComplete === true
  }

  if (finishState) {
    return (
      <FinishPanel
        state={finishState}
        checkSetupComplete={checkSetupComplete}
        onComplete={() => {
          setFinishState(null)
          router.push("/login")
        }}
      />
    )
  }

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col gap-6">
      {reconfiguring && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-2">
          <span>{t("wizard.reconfiguring")}</span>
          <a href="/dashboard" className="text-primary hover:underline font-medium">
            {t("wizard.backToDashboard")}
          </a>
        </div>
      )}
      <WizardStepper steps={steps} currentStep={currentStep} />
      
      <div className="bg-background/80 backdrop-blur-md border shadow-xl rounded-3xl p-6 sm:p-8 min-h-[400px] flex flex-col justify-center">
        {currentStep === 0 && (
          <WelcomeStep locale={locale} onLocaleChange={setLocale} onNext={handleNext} />
        )}
        {currentStep === 1 && (
          <DatabaseStep 
            connectionString={connectionString} 
            onConnectionStringChange={setConnectionString}
            useExistingData={useExistingData}
            onUseExistingDataChange={setUseExistingData}
            onExistingChartChange={setExistingChartOfAccounts}
            onNext={handleNext} 
            onBack={handleBack} 
          />
        )}
        {currentStep === 2 && (
          <AdminStep admin={admin} onAdminChange={handleAdminChange} onNext={handleNext} onBack={handleBack} />
        )}
        {currentStep === 3 && (
          <IntegrationsStep 
            integrations={integrations} 
            onIntegrationChange={handleIntegrationChange} 
            onNext={handleNext} 
            onBack={handleBack} 
          />
        )}
        {currentStep === 4 && (
          <ChartOfAccountsStep 
            useExistingData={useExistingData} 
            onUseExistingDataChange={setUseExistingData}
            existingChart={existingChartOfAccounts}
            onNext={handleNext} 
            onBack={handleBack} 
          />
        )}
        {currentStep === 5 && (
          <SummaryStep 
            useExistingData={useExistingData}
            adminName={admin.name}
            adminEmail={admin.email}
            integrations={{
              google: integrations.google.enabled,
              telegram: integrations.telegram.enabled,
              openai: integrations.openai.enabled
            }}
            isConfiguring={isConfiguring}
            onNext={handleFinish} 
            onBack={handleBack} 
          />
        )}
      </div>
    </div>
  )
}
