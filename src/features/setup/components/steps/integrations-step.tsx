"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Puzzle,
  ChevronDown,
  ChevronUp,
  Bot,
  Brain,
} from "lucide-react"

function GoogleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="size-6">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

interface IntegrationConfig {
  google: { enabled: boolean; clientId: string; clientSecret: string }
  telegram: { enabled: boolean; botToken: string; botUsername: string; webhookSecret: string }
  openai: { enabled: boolean; apiKey: string }
}

interface IntegrationsStepProps {
  integrations: IntegrationConfig
  onIntegrationChange: (integration: string, field: string, value: string | boolean) => void
  onNext: () => void
  onBack: () => void
}

function IntegrationCard({
  icon,
  title,
  description,
  enabled,
  onToggle,
  expanded,
  onToggleExpand,
  children,
}: {
  icon: React.ReactNode
  title: string
  description: string
  enabled: boolean
  onToggle: (enabled: boolean) => void
  expanded: boolean
  onToggleExpand: () => void
  children: React.ReactNode
}) {
  const t = useTranslations("setup.integrations")

  return (
    <div
      className={`rounded-xl border-2 transition-all duration-200 ${
        enabled ? "border-primary/30 bg-primary/5" : "border-muted"
      }`}
    >
      <div className="flex items-center gap-3 p-4">
        <div className="shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} />
      </div>
      {enabled && (
        <div className="px-4 pb-4">
          <button
            onClick={onToggleExpand}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2 cursor-pointer"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? t("hideFields") : t("configureCredentials")}
          </button>
          {expanded && (
            <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
              {children}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function IntegrationsStep({

  integrations,
  onIntegrationChange,
  onNext,
  onBack,
}: IntegrationsStepProps) {
  const t = useTranslations("setup.integrations")
  const tc = useTranslations("setup.common")
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    google: false,
    telegram: false,
    openai: false,
  })

  const toggleExpand = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="text-center">
        <div className="inline-flex p-3 rounded-xl bg-primary/10 border border-primary/20 mb-3">
          <Puzzle className="w-6 h-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">{t("heading")}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("intro")}
        </p>
      </div>

      <div className="space-y-3">
        {/* Google OAuth */}
        <IntegrationCard
          icon={<GoogleIcon />}
          title={t("google.title")}
          description={t("google.shortDesc")}
          enabled={integrations.google.enabled}
          onToggle={(val) => onIntegrationChange("google", "enabled", val)}
          expanded={expanded.google}
          onToggleExpand={() => toggleExpand("google")}
        >
          <div className="space-y-2">
            <Label className="text-xs">{t("google.clientId")}</Label>
            <Input
              value={integrations.google.clientId}
              onChange={(e) => onIntegrationChange("google", "clientId", e.target.value)}
              placeholder="123456789.apps.googleusercontent.com"
              className="text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">{t("google.clientSecret")}</Label>
            <Input
              type="password"
              value={integrations.google.clientSecret}
              onChange={(e) => onIntegrationChange("google", "clientSecret", e.target.value)}
              placeholder="GOCSPX-..."
              className="text-xs"
            />
          </div>
        </IntegrationCard>

        {/* Telegram */}
        <IntegrationCard
          icon={<Bot className="w-6 h-6 text-info" />}
          title={t("telegram.title")}
          description={t("telegram.shortDesc")}
          enabled={integrations.telegram.enabled}
          onToggle={(val) => onIntegrationChange("telegram", "enabled", val)}
          expanded={expanded.telegram}
          onToggleExpand={() => toggleExpand("telegram")}
        >
          <div className="space-y-2">
            <Label className="text-xs">{t("telegram.botTokenLabel")}</Label>
            <Input
              value={integrations.telegram.botToken}
              onChange={(e) => onIntegrationChange("telegram", "botToken", e.target.value)}
              placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
              className="text-xs font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">{t("telegram.botUsernameLabel")}</Label>
            <Input
              value={integrations.telegram.botUsername}
              onChange={(e) => onIntegrationChange("telegram", "botUsername", e.target.value)}
              placeholder="meu_bot"
              className="text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">{t("telegram.webhookSecretLabel")}</Label>
            <Input
              type="password"
              value={integrations.telegram.webhookSecret}
              onChange={(e) => onIntegrationChange("telegram", "webhookSecret", e.target.value)}
              placeholder={t("telegram.webhookSecretPlaceholder")}
              className="text-xs"
            />
          </div>
        </IntegrationCard>

        {/* OpenAI */}
        <IntegrationCard
          icon={<Brain className="w-6 h-6 text-positive" />}
          title="OpenAI (IA)"
          description={t("openai.shortDesc")}
          enabled={integrations.openai.enabled}
          onToggle={(val) => onIntegrationChange("openai", "enabled", val)}
          expanded={expanded.openai}
          onToggleExpand={() => toggleExpand("openai")}
        >
          <div className="space-y-2">
            <Label className="text-xs">{t("openai.apiKey")}</Label>
            <Input
              type="password"
              value={integrations.openai.apiKey}
              onChange={(e) => onIntegrationChange("openai", "apiKey", e.target.value)}
              placeholder="sk-..."
              className="text-xs font-mono"
            />
          </div>
        </IntegrationCard>
      </div>

      {/* Navigation */}
      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onBack} className="flex-1">
          {tc("back")}
        </Button>
        <Button onClick={onNext} className="flex-1">
          {tc("next")}
        </Button>
      </div>
    </div>
  )
}
