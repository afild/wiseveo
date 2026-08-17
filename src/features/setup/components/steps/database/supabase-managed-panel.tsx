"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CheckCircle2, Eye, EyeOff, ExternalLink, Loader2, ShieldCheck, Sparkles, XCircle } from "lucide-react"
import { composeConnectionUrl, generateDbPassword, PROVIDER_LINKS } from "@/features/setup/lib/connection-url"
import { ExternalLinkButton } from "./connection-url-panel"

type Phase = "token" | "inspecting" | "ready" | "creating" | "waiting" | "connecting" | "done" | "error"
type Mode = "create" | "existing"

interface Organization {
  slug: string
  name: string
}
interface Project {
  ref: string
  name: string
  region: string
  status: string
  organizationSlug: string
}
interface RegionOption {
  type: "specific" | "smartGroup"
  code: string
  name: string
}
interface InspectData {
  organizations: Organization[]
  projects: Project[]
  regions: { recommended: RegionOption | null; options: RegionOption[] }
}

interface SupabaseManagedPanelProps {
  /** Testa a URL montada (o pai mostra o resultado) e devolve se conectou. */
  testConnection: (url: string) => Promise<boolean>
}

const POLL_INTERVAL_MS = 5000
const POLL_TIMEOUT_MS = 6 * 60 * 1000
const PAUSED_STATUSES = new Set(["INACTIVE", "PAUSING", "PAUSED", "GOING_DOWN"])

class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

/**
 * Caminho "deixar o WISEVEO criar/conectar": a pessoa cola um token pessoal
 * do Supabase e o restante é automático (criar projeto, esperar ficar pronto,
 * montar a URL do pooler, testar). O token vive só neste componente e é
 * zerado ao concluir, ao trocar de token e ao desmontar.
 */
export function SupabaseManagedPanel({ testConnection }: SupabaseManagedPanelProps) {
  const t = useTranslations("setup.database.managed")
  const tErr = useTranslations("api.setup.errors")

  const [token, setToken] = useState("")
  const [showToken, setShowToken] = useState(false)
  const [phase, setPhase] = useState<Phase>("token")
  const [data, setData] = useState<InspectData | null>(null)
  const [mode, setMode] = useState<Mode>("create")
  const [orgSlug, setOrgSlug] = useState("")
  const [regionKey, setRegionKey] = useState("")
  const [projectName, setProjectName] = useState("wiseveo") // i18n-ignore: nome técnico padrão do projeto
  const [selectedRef, setSelectedRef] = useState("")
  const [existingPassword, setExistingPassword] = useState("")
  const [resetConsent, setResetConsent] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [isPausedError, setIsPausedError] = useState(false)
  const [waitSeconds, setWaitSeconds] = useState(0)
  const [wasCreated, setWasCreated] = useState(false)

  const cancelledRef = useRef(false)
  useEffect(() => {
    cancelledRef.current = false
    return () => {
      cancelledRef.current = true
      // Desmontou (trocou de caminho/passo): nada do token sobra em memória.
      setToken("")
    }
  }, [])

  const busy = phase === "inspecting" || phase === "creating" || phase === "waiting" || phase === "connecting"

  async function api<T = Record<string, unknown>>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch("/api/setup/supabase", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token.trim()}` },
      body: JSON.stringify({ action, ...payload }),
    })
    const body = (await res.json().catch(() => ({}))) as { success?: boolean; code?: string; message?: string }
    if (!res.ok || !body.success) {
      throw new ApiError(body.code ?? "providerError", body.message ?? tErr("providerError"))
    }
    return body as T
  }

  function failWith(error: unknown) {
    if (cancelledRef.current) return
    setPhase("error")
    setIsPausedError(false)
    setErrorMessage(error instanceof Error && error.message ? error.message : tErr("providerError"))
  }

  async function inspect() {
    setPhase("inspecting")
    setErrorMessage("")
    try {
      const result = await api<InspectData>("inspect")
      if (cancelledRef.current) return
      setData(result)
      setOrgSlug(result.organizations[0]?.slug ?? "")
      const rec = result.regions.recommended ?? result.regions.options[0] ?? null
      setRegionKey(rec ? `${rec.type}:${rec.code}` : "")
      setSelectedRef(result.projects[0]?.ref ?? "")
      setMode("create")
      setPhase("ready")
    } catch (e) {
      failWith(e)
    }
  }

  async function waitUntilHealthy(ref: string): Promise<string> {
    const started = Date.now()
    for (;;) {
      if (cancelledRef.current) throw new ApiError("cancelled", "")
      const { status } = await api<{ status: string }>("project-status", { ref })
      if (status === "ACTIVE_HEALTHY") return status
      if (status === "INIT_FAILED" || status === "REMOVED" || status === "RESTORE_FAILED") {
        throw new ApiError("projectInitFailed", tErr("projectInitFailed"))
      }
      if (Date.now() - started > POLL_TIMEOUT_MS) throw new ApiError("projectNotReady", tErr("projectNotReady"))
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      setWaitSeconds(Math.round((Date.now() - started) / 1000))
    }
  }

  async function connectWithPassword(ref: string, password: string) {
    setPhase("connecting")
    const { pooler } = await api<{
      pooler: { dbUser: string; dbHost: string; dbPort: number; dbName: string }
    }>("pooler", { ref })
    const url = composeConnectionUrl({
      user: pooler.dbUser,
      password,
      host: pooler.dbHost,
      port: pooler.dbPort,
      database: pooler.dbName,
    })
    const ok = await testConnection(url)
    if (cancelledRef.current) return
    if (ok) {
      setPhase("done")
      setToken("")
    } else {
      // O pai já mostra o motivo; aqui só devolvemos o controle.
      setPhase("ready")
    }
  }

  async function createAndConnect() {
    if (!orgSlug || !regionKey) return
    const [type, code] = regionKey.split(":") as ["specific" | "smartGroup", string]
    const password = generateDbPassword()
    setErrorMessage("")
    setWaitSeconds(0)
    try {
      setPhase("creating")
      const { ref } = await api<{ ref: string }>("create-project", {
        organizationSlug: orgSlug,
        name: projectName.trim() || "wiseveo", // i18n-ignore
        dbPassword: password,
        regionSelection: { type, code },
      })
      if (cancelledRef.current) return
      setPhase("waiting")
      await waitUntilHealthy(ref)
      setWasCreated(true)
      await connectWithPassword(ref, password)
    } catch (e) {
      if (e instanceof ApiError && e.code === "cancelled") return
      failWith(e)
    }
  }

  async function connectExisting() {
    const project = data?.projects.find((p) => p.ref === selectedRef)
    if (!project) return
    setErrorMessage("")
    if (PAUSED_STATUSES.has(project.status)) {
      setPhase("error")
      setIsPausedError(true)
      setErrorMessage(t("projectPaused"))
      return
    }
    try {
      let password = existingPassword
      if (!password) {
        if (!resetConsent) return
        password = generateDbPassword()
        setPhase("creating")
        await api("reset-password", { ref: project.ref, password })
      }
      if (project.status !== "ACTIVE_HEALTHY") {
        setPhase("waiting")
        await waitUntilHealthy(project.ref)
      }
      setWasCreated(false)
      await connectWithPassword(project.ref, password)
    } catch (e) {
      if (e instanceof ApiError && e.code === "cancelled") return
      failWith(e)
    }
  }

  function resetToken() {
    setToken("")
    setData(null)
    setPhase("token")
    setErrorMessage("")
  }

  const selectedProject = data?.projects.find((p) => p.ref === selectedRef)
  const canConnectExisting =
    !!selectedProject && (existingPassword.length > 0 || resetConsent)

  // ── Fase: colar o token ─────────────────────────────────────────────
  if (phase === "token" || phase === "inspecting") {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
          <p className="text-sm">
            <span className="text-muted-foreground">{t("noAccount")}</span>{" "}
            <a
              href={PROVIDER_LINKS.supabaseSignUp}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              {t("createAccount")}
              <ExternalLink className="size-3" />
            </a>
          </p>
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("stepToken")}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{t("tokenGuide")}</p>
            <ExternalLinkButton href={PROVIDER_LINKS.supabaseTokens}>{t("openTokens")}</ExternalLinkButton>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="sb-token" className="text-sm font-medium">
            {t("tokenLabel")}
          </Label>
          <div className="relative">
            <Input
              id="sb-token"
              type={showToken ? "text" : "password"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="sbp_…" // i18n-ignore: prefixo técnico do token
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-sm pr-10"
              disabled={phase === "inspecting"}
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              aria-label={showToken ? t("hideToken") : t("showToken")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground flex items-start gap-1.5 leading-relaxed">
            <ShieldCheck className="size-3.5 mt-0.5 shrink-0 text-positive" />
            <span>{t("tokenSecurity")}</span>
          </p>
        </div>

        {phase === "inspecting" ? (
          <Button disabled className="w-full">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            {t("inspecting")}
          </Button>
        ) : (
          <Button onClick={inspect} disabled={token.trim().length < 8} className="w-full">
            {t("continueWithToken")}
          </Button>
        )}
      </div>
    )
  }

  // ── Fase: concluído ─────────────────────────────────────────────────
  if (phase === "done") {
    return (
      <div className="rounded-xl border border-positive/30 bg-positive/5 p-4 space-y-3 animate-in fade-in duration-300">
        <div className="flex items-center gap-2 text-positive font-medium">
          <CheckCircle2 className="w-5 h-5" />
          {wasCreated ? t("done") : t("doneExisting")}
        </div>
        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
          <ShieldCheck className="size-3.5 mt-0.5 shrink-0" />
          <span>{t("revokeReminder")}</span>
        </p>
        <ExternalLinkButton href={PROVIDER_LINKS.supabaseTokens}>{t("revokeLink")}</ExternalLinkButton>
      </div>
    )
  }

  // ── Fase: em andamento ──────────────────────────────────────────────
  if (busy) {
    const label =
      phase === "creating"
        ? t("progressCreating")
        : phase === "waiting"
          ? t("progressWaiting", { seconds: waitSeconds })
          : t("progressConnecting")
    return (
      <div className="rounded-xl border bg-muted/20 p-6 flex flex-col items-center gap-3 text-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm font-medium">{label}</p>
        {phase === "waiting" && <p className="text-xs text-muted-foreground">{t("waitingHint")}</p>}
      </div>
    )
  }

  // ── Fase: pronto para escolher (ou erro recuperável) ────────────────
  const orgs = data?.organizations ?? []
  const projects = data?.projects ?? []
  const regionOptions = data?.regions.options ?? []
  const recommendedKey = data?.regions.recommended ? `${data.regions.recommended.type}:${data.regions.recommended.code}` : ""

  return (
    <div className="flex flex-col gap-4">
      {phase === "error" && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 animate-in fade-in duration-300">
          <div className="flex items-center gap-2 text-destructive font-medium">
            <XCircle className="w-5 h-5" />
            {t("errorTitle")}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{errorMessage}</p>
          {isPausedError && (
            <div className="mt-2">
              <ExternalLinkButton href={PROVIDER_LINKS.supabaseDashboard}>{t("openDashboard")}</ExternalLinkButton>
            </div>
          )}
        </div>
      )}

      {data && (
        <>
          {/* Modo */}
          {projects.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {(["create", "existing"] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`p-3 rounded-xl border-2 text-sm font-medium transition-all cursor-pointer ${
                    mode === m ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/30"
                  }`}
                >
                  {m === "create" ? t("modeCreate") : t("modeExisting")}
                </button>
              ))}
            </div>
          )}

          {mode === "create" ? (
            <div className="space-y-3">
              {orgs.length > 1 && (
                <div className="space-y-1.5">
                  <Label className="text-sm">{t("organization")}</Label>
                  <Select value={orgSlug} onValueChange={setOrgSlug}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {orgs.map((o) => (
                        <SelectItem key={o.slug} value={o.slug}>
                          {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {regionOptions.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-sm">{t("region")}</Label>
                  <Select value={regionKey} onValueChange={setRegionKey}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {regionOptions.map((r) => {
                        const key = `${r.type}:${r.code}`
                        return (
                          <SelectItem key={key} value={key}>
                            {key === recommendedKey ? t("regionRecommended", { name: r.name }) : r.name}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="sb-project-name" className="text-sm">
                  {t("projectName")}
                </Label>
                <Input
                  id="sb-project-name"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  maxLength={64}
                />
              </div>
              <Button onClick={createAndConnect} disabled={!orgSlug || !regionKey} className="w-full">
                <Sparkles className="w-4 h-4 mr-2" />
                {t("createButton")}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-sm">{t("project")}</Label>
                <Select value={selectedRef} onValueChange={setSelectedRef}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.ref} value={p.ref}>
                        {p.name} · {p.region} · {p.status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sb-existing-password" className="text-sm">
                  {t("existingPasswordLabel")}
                </Label>
                <p className="text-xs text-muted-foreground">{t("existingPasswordHint")}</p>
                <Input
                  id="sb-existing-password"
                  type="password"
                  value={existingPassword}
                  onChange={(e) => setExistingPassword(e.target.value)}
                  autoComplete="new-password"
                  className="font-mono text-sm"
                />
              </div>
              {existingPassword.length === 0 && (
                <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
                  <Checkbox
                    checked={resetConsent}
                    onCheckedChange={(v) => setResetConsent(v === true)}
                    className="mt-0.5"
                  />
                  <span>{t("resetConsent")}</span>
                </label>
              )}
              <Button onClick={connectExisting} disabled={!canConnectExisting} className="w-full">
                {t("connectButton")}
              </Button>
            </div>
          )}
        </>
      )}

      <button type="button" onClick={resetToken} className="text-xs text-muted-foreground hover:text-foreground self-start cursor-pointer">
        {t("changeToken")}
      </button>
    </div>
  )
}
