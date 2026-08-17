"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Eye, EyeOff, ExternalLink, Loader2, Server } from "lucide-react"
import {
  buildConnectionUrl,
  hasPasswordPlaceholder,
  normalizeConnectionUrl,
  parseConnectionUrl,
  PROVIDER_LINKS,
} from "@/features/setup/lib/connection-url"

type Provider = "supabase" | "neon" | "other"

interface ConnectionUrlPanelProps {
  onConnectionStringChange: (value: string) => void
  onTest: () => void
  testing: boolean
  errorCode: string | null
}

export function ExternalLinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button asChild variant="secondary" size="sm" className="gap-1.5">
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
        <ExternalLink className="size-3.5" />
      </a>
    </Button>
  )
}

/**
 * Caminho "já tenho a URL": guia curto por provedor + campo mascarado que
 * aceita a URL colada do jeito que veio (com [YOUR-PASSWORD]) e um campo de
 * senha separado — o WISEVEO monta a URL final e codifica a senha.
 */
export function ConnectionUrlPanel({ onConnectionStringChange, onTest, testing, errorCode }: ConnectionUrlPanelProps) {
  const t = useTranslations("setup.database")
  const [provider, setProvider] = useState<Provider>("supabase")
  const [rawUrl, setRawUrl] = useState("")
  const [password, setPassword] = useState("")
  const [showUrl, setShowUrl] = useState(false)

  const normalized = normalizeConnectionUrl(rawUrl)
  const parsed = normalized ? parseConnectionUrl(normalized) : null
  const needsPassword = parsed !== null && hasPasswordPlaceholder(normalized)
  const canTest = parsed !== null && (!needsPassword || password.length > 0)

  useEffect(() => {
    onConnectionStringChange(parsed ? buildConnectionUrl(normalized, needsPassword ? password : "") : "")
    // onConnectionStringChange é estável (setState do wizard)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalized, password, needsPassword, parsed !== null])

  const providers: Array<{ id: Provider; label: string }> = [
    { id: "supabase", label: t("providerSupabase") },
    { id: "neon", label: t("providerNeon") },
    { id: "other", label: t("providerOther") },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* Provedor */}
      <div className="flex flex-wrap gap-2">
        {providers.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setProvider(p.id)}
            className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors cursor-pointer ${
              provider === p.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-muted text-muted-foreground hover:border-muted-foreground/40"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Passo 1 — abrir o painel */}
      {provider !== "other" && (
        <div className="rounded-xl border bg-muted/20 p-4 space-y-2">
          <p className="text-sm font-medium">{t("stepOpen")}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {provider === "supabase" ? t("guideSupabase") : t("guideNeon")}
          </p>
          <ExternalLinkButton href={provider === "supabase" ? PROVIDER_LINKS.supabaseConnect : PROVIDER_LINKS.neonProjects}>
            {provider === "supabase" ? t("openInSupabase") : t("openInNeon")}
          </ExternalLinkButton>
        </div>
      )}

      {/* Passo 2 — colar a URL */}
      <div className="space-y-2">
        <Label htmlFor="db-url" className="text-sm font-medium">
          {provider === "other" ? t("urlLabel") : t("stepPaste")}
        </Label>
        {provider === "other" && <p className="text-xs text-muted-foreground">{t("guideOther")}</p>}
        <div className="relative">
          <Input
            id="db-url"
            type={showUrl ? "text" : "password"}
            value={rawUrl}
            onChange={(e) => setRawUrl(e.target.value)}
            placeholder={t("urlPlaceholder")}
            autoComplete="off"
            spellCheck={false}
            className="font-mono text-sm pr-10"
          />
          <button
            type="button"
            onClick={() => setShowUrl((v) => !v)}
            aria-label={showUrl ? t("hideUrl") : t("showUrl")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            {showUrl ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      {/* Passo 3 — senha, só quando a URL veio sem ela */}
      {needsPassword && (
        <div className="space-y-2 animate-in fade-in duration-300">
          <Label htmlFor="db-password" className="text-sm font-medium">
            {t("stepPassword")}
          </Label>
          <p className="text-xs text-muted-foreground">{t("passwordHint")}</p>
          <Input
            id="db-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className="font-mono text-sm"
          />
          {provider === "supabase" && (
            <a
              href={PROVIDER_LINKS.supabaseResetPassword}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              {t("forgotPassword")}
              <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      )}

      {/* Dica específica: URL de conexão direta (só IPv6) */}
      {errorCode === "ipv6Unreachable" && (
        <ExternalLinkButton href={PROVIDER_LINKS.supabaseConnect}>{t("usePooler")}</ExternalLinkButton>
      )}

      <Button onClick={onTest} disabled={!canTest || testing} variant="outline" className="w-full">
        {testing ? (
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
  )
}
