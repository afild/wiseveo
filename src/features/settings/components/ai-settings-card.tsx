"use client"

import React from "react"
import { useLocale, useTranslations } from "next-intl"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Brain, CheckCircle2, FlaskConical, Loader2, Trash2 } from "lucide-react"
import { createNumberFormatter } from "@/i18n/format"
import { AI_PROVIDER_IDS, AI_PROVIDERS, type AiProviderId } from "@/features/ai/lib/catalog"

export interface AiModelChoiceView {
  provider: AiProviderId
  model: string
}

export interface AiSettingsSnapshot {
  providers: Record<AiProviderId, { configured: boolean; source: "db" | "env" | null }>
  compatibleBaseUrl: string | null
  models: { fast: AiModelChoiceView; smart: AiModelChoiceView }
  budget: { monthlyLimitUsd: number | null }
  usage: { period: string; calls: number; costUsd: number }
}

interface AiSettingsCardProps {
  /** Tabelas do "Preparar meu banco" prontas? Sem elas, só leitura + aviso. */
  structureReady: boolean
  initial: AiSettingsSnapshot
}

/**
 * Cartão "Inteligência artificial" (Configurações → Integrações, só SUPERADMIN).
 * Três blocos: chaves por provedor (colar, testar, remover), os dois níveis de
 * modelo (econômico/avançado) e o teto mensal com o gasto estimado do mês.
 * Nenhuma chave volta do servidor — a tela só vê "configurada: sim/não".
 */
export function AiSettingsCard({ structureReady, initial }: AiSettingsCardProps) {
  const t = useTranslations("settings.integrations.ai")
  const locale = useLocale()
  const [data, setData] = React.useState(initial)
  const [provider, setProvider] = React.useState<AiProviderId>("openai")
  const [apiKey, setApiKey] = React.useState("")
  const [baseUrl, setBaseUrl] = React.useState(initial.compatibleBaseUrl ?? "")
  const [fast, setFast] = React.useState<AiModelChoiceView>(initial.models.fast)
  const [smart, setSmart] = React.useState<AiModelChoiceView>(initial.models.smart)
  const [budget, setBudget] = React.useState(
    initial.budget.monthlyLimitUsd === null ? "" : String(initial.budget.monthlyLimitUsd),
  )
  const [testing, setTesting] = React.useState(false)
  const [savingKey, setSavingKey] = React.useState(false)
  const [removing, setRemoving] = React.useState<AiProviderId | null>(null)
  const [savingSettings, setSavingSettings] = React.useState(false)
  // A lista que o PROVEDOR devolveu, por provedor. `undefined` = ainda não
  // perguntamos; `[]` = perguntamos e não veio nada (aí a tela deixa digitar).
  const [providerModels, setProviderModels] = React.useState<
    Partial<Record<AiProviderId, string[]>>
  >({})
  const [loadingModels, setLoadingModels] = React.useState<AiProviderId | null>(null)
  // Níveis que a pessoa colocou em "digitar à mão" — self-host e modelo
  // recém-lançado precisam desse caminho, senão a lista viraria uma prisão.
  const [manualTiers, setManualTiers] = React.useState<Record<string, boolean>>({})

  const money = createNumberFormatter(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  // Duas listas, de propósito:
  // - USÁVEL como modelo segue a régua do servidor (o "compatível" precisa do
  //   ENDEREÇO; a chave é opcional em self-host) — senão a tela ofereceria um
  //   provedor que o servidor recusa ao salvar;
  // - VISÍVEL inclui o que tem qualquer coisa guardada, para que uma chave
  //   gravada sem endereço ainda apareça com o botão de remover (senão o segredo
  //   ficaria preso no banco, sem caminho na tela para apagá-lo).
  const usableProviders = AI_PROVIDER_IDS.filter((id) =>
    id === "compatible" ? Boolean(data.compatibleBaseUrl) : Boolean(data.providers[id]?.configured),
  )
  const visibleProviders = AI_PROVIDER_IDS.filter(
    (id) => data.providers[id]?.configured || (id === "compatible" && data.compatibleBaseUrl),
  )

  async function callApi(method: "PUT" | "POST", url: string, body: unknown) {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.success) throw new Error(payload?.message ?? t("error"))
    return payload.data
  }

  /**
   * Pergunta ao provedor quais modelos a chave tem. `silent` para a carga
   * automática da abertura: falhar ali não pode encher a tela de aviso vermelho
   * antes de a pessoa ter pedido qualquer coisa.
   */
  const loadModels = React.useCallback(
    async (id: AiProviderId, options: { silent?: boolean; apiKey?: string; baseUrl?: string } = {}) => {
      setLoadingModels(id)
      try {
        const response = await fetch("/api/admin/ai-settings/models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: id,
            apiKey: options.apiKey?.trim() || undefined,
            baseUrl: id === "compatible" ? options.baseUrl?.trim() || undefined : undefined,
          }),
        })
        const payload = await response.json().catch(() => null)
        if (!response.ok || !payload?.success) throw new Error(payload?.message ?? t("error"))
        setProviderModels((current) => ({ ...current, [id]: payload.data.models as string[] }))
        if (!options.silent) {
          const count = (payload.data.models as string[]).length
          if (count > 0) toast.success(t("modelsLoaded", { count }))
          else toast.warning(t("modelsEmpty"))
        }
      } catch (error) {
        if (!options.silent) toast.error(error instanceof Error ? error.message : t("error"))
      } finally {
        setLoadingModels(null)
      }
    },
    [t],
  )

  /**
   * A lista é buscada quando a pessoa ABRE o campo de modelo, e não ao carregar
   * a tela: quem entra em Integrações para mexer no bot não deveria disparar uma
   * chamada a cada provedor configurado. Sem alarde — falhar aqui só deixa as
   * sugestões do catálogo no lugar, como era antes.
   */
  function loadModelsOnOpen(id: AiProviderId, open: boolean) {
    if (open && providerModels[id] === undefined && loadingModels !== id) {
      void loadModels(id, { silent: true, baseUrl })
    }
  }

  async function testProvider() {
    setTesting(true)
    try {
      // Manda o modelo que a pessoa já escolheu para este provedor: sem isso o
      // "compatível" (que não tem sugestão de catálogo) não teria o que testar.
      const typedModel =
        (fast.provider === provider && fast.model.trim()) ||
        (smart.provider === provider && smart.model.trim()) ||
        undefined
      const result = await callApi("POST", "/api/admin/ai-settings/test", {
        provider,
        model: typedModel || undefined,
        apiKey: apiKey.trim() || undefined,
        baseUrl: provider === "compatible" ? baseUrl.trim() || undefined : undefined,
      })
      toast.success(t("testOk", { model: result.model, ms: result.latencyMs }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("error"))
    } finally {
      setTesting(false)
    }
  }

  async function saveKey() {
    setSavingKey(true)
    try {
      const body: Record<string, unknown> = {}
      if (apiKey.trim()) body.keys = { [provider]: apiKey.trim() }
      if (provider === "compatible") body.compatibleBaseUrl = baseUrl.trim() || null
      const next = await callApi("PUT", "/api/admin/ai-settings", body)
      setData(next)
      setApiKey("")
      toast.success(t("keySaved"))
      // Chave nova, catálogo novo: a lista de modelos daquela conta muda com ela.
      void loadModels(provider, { silent: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("error"))
    } finally {
      setSavingKey(false)
    }
  }

  async function removeKey(id: AiProviderId) {
    setRemoving(id)
    try {
      const body: Record<string, unknown> = { keys: { [id]: null } }
      if (id === "compatible") body.compatibleBaseUrl = null
      const next = await callApi("PUT", "/api/admin/ai-settings", body)
      setData(next)
      toast.success(t("keyRemoved"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("error"))
    } finally {
      setRemoving(null)
    }
  }

  async function saveModelsAndBudget() {
    setSavingSettings(true)
    try {
      const parsedBudget = budget.trim() === "" ? null : Number(budget.replace(",", "."))
      if (parsedBudget !== null && (!Number.isFinite(parsedBudget) || parsedBudget < 0)) {
        toast.error(t("invalidBudget"))
        return
      }
      // Os modelos só entram no pedido quando estão completos e com provedor
      // usável. O TETO salva SEMPRE — inclusive quando os modelos estão pela
      // metade (ex.: a chave do provedor escolhido foi removida depois): aí o
      // aviso conta o que ficou pendente, em vez de barrar o salvamento inteiro
      // ou descartar a edição em silêncio.
      const modelsComplete = [fast, smart].every(
        (choice) => choice.model.trim() && usableProviders.includes(choice.provider),
      )
      const next = await callApi("PUT", "/api/admin/ai-settings", {
        ...(modelsComplete ? { models: { fast, smart } } : {}),
        budget: { monthlyLimitUsd: parsedBudget },
      })
      setData(next)
      if (modelsComplete) toast.success(t("saved"))
      else if (usableProviders.length > 0) toast.warning(t("modelsIncomplete"))
      else toast.success(t("savedBudgetOnly"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("error"))
    } finally {
      setSavingSettings(false)
    }
  }

  function tierEditor(
    label: string,
    desc: string,
    value: AiModelChoiceView,
    onChange: (next: AiModelChoiceView) => void,
    idPrefix: string,
  ) {
    const fetched = providerModels[value.provider]
    const suggestions = AI_PROVIDERS[value.provider].suggestedModels
    // O que veio do provedor manda; sem isso, as sugestões do catálogo seguram a
    // tela. O modelo já salvo entra sempre — senão o campo abriria vazio se o
    // provedor tiver aposentado aquele id.
    const options = Array.from(
      new Set([...(fetched ?? suggestions), ...(value.model ? [value.model] : [])]),
    ).sort((a, b) => a.localeCompare(b))
    const manual = manualTiers[idPrefix] || options.length === 0
    const loading = loadingModels === value.provider

    return (
      <div className="space-y-2 rounded-lg border p-3">
        <p id={`${idPrefix}-label`} className="text-sm font-medium">
          {label}
        </p>
        <p className="text-xs text-muted-foreground">{desc}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select
            value={value.provider}
            onValueChange={(next) => onChange({ provider: next as AiProviderId, model: "" })}
          >
            <SelectTrigger
              className="sm:w-56 cursor-pointer"
              aria-label={`${label} — ${t("providerLabel")}`}
            >
              <SelectValue placeholder={t("providerLabel")} />
            </SelectTrigger>
            <SelectContent>
              {/* O provedor já escolhido entra na lista mesmo sem chave: fora
                  dela, o campo apareceria VAZIO (nem o nome, nem o texto de
                  ajuda) depois de remover a chave dele. */}
              {Array.from(new Set([...usableProviders, value.provider])).map((id) => (
                <SelectItem key={id} value={id} className="cursor-pointer">
                  {AI_PROVIDERS[id].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {manual ? (
            <Input
              id={`${idPrefix}-model`}
              aria-label={`${label} — ${t("modelPlaceholder")}`}
              list={`${idPrefix}-models`}
              value={value.model}
              onChange={(e) => onChange({ ...value, model: e.target.value })}
              placeholder={t("modelPlaceholder")}
              className="font-mono text-xs"
            />
          ) : (
            <Select
              value={value.model}
              onValueChange={(model) => onChange({ ...value, model })}
              onOpenChange={(open) => loadModelsOnOpen(value.provider, open)}
            >
              <SelectTrigger
                className="flex-1 cursor-pointer font-mono text-xs"
                aria-label={`${label} — ${t("modelPlaceholder")}`}
              >
                <SelectValue placeholder={t("modelPlaceholder")} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {options.map((model) => (
                  <SelectItem key={model} value={model} className="cursor-pointer font-mono text-xs">
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <datalist id={`${idPrefix}-models`}>
            {options.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="cursor-pointer text-xs text-primary hover:underline disabled:opacity-50"
            disabled={loading}
            onClick={() => loadModels(value.provider, { baseUrl })}
          >
            {loading ? t("modelsLoading") : t("modelsRefresh")}
          </button>
          {options.length > 0 && (
            <button
              type="button"
              className="cursor-pointer text-xs text-muted-foreground hover:underline"
              onClick={() =>
                setManualTiers((current) => ({ ...current, [idPrefix]: !current[idPrefix] }))
              }
            >
              {manual ? t("modelsFromList") : t("modelsTypeOther")}
            </button>
          )}
          {fetched && (
            <span className="text-xs text-muted-foreground">
              {t("modelsCount", { count: fetched.length })}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Brain className="size-4 text-positive" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Provedores com algo guardado (mesmo o que ainda não serve como
            modelo — precisa aparecer para poder ser removido) */}
        {visibleProviders.length > 0 && (
          <ul className="space-y-1.5">
            {visibleProviders.map((id) => (
              <li key={id} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="size-4 text-positive" />
                <span className="font-medium">{AI_PROVIDERS[id].label}</span>
                {data.providers[id]?.source === "env" && (
                  <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs text-warning">
                    {t("sourceEnv")}
                  </span>
                )}
                {/* Também some o "compatível" configurado só por endereço (sem chave). */}
                {(data.providers[id]?.source === "db" ||
                  (id === "compatible" && data.compatibleBaseUrl)) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="cursor-pointer text-destructive"
                    disabled={removing === id}
                    onClick={() => removeKey(id)}
                  >
                    <Trash2 className="size-3.5" />
                    {t("removeKey")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {!structureReady ? (
          <p className="text-sm text-muted-foreground">{t("needsPrepare")}</p>
        ) : (
          <>
            {/* Colar/testar chave */}
            <div className="space-y-2">
              <Label htmlFor="ai-api-key" className="text-sm">
                {t("keyLabel")}
              </Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select value={provider} onValueChange={(next) => setProvider(next as AiProviderId)}>
                  <SelectTrigger className="sm:w-56 cursor-pointer" aria-label={t("providerLabel")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_PROVIDER_IDS.map((id) => (
                      <SelectItem key={id} value={id} className="cursor-pointer">
                        {AI_PROVIDERS[id].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  id="ai-api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={t("keyPlaceholder")}
                  className="font-mono text-xs"
                />
              </div>
              {provider === "compatible" && (
                <Input
                  id="ai-compatible-base-url"
                  aria-label={t("baseUrlLabel")}
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  /* i18n-ignore: exemplo de endereço técnico (host:porta), igual nos 3 idiomas */
                  placeholder="http://localhost:11434/v1"
                  className="font-mono text-xs"
                />
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="cursor-pointer"
                  disabled={testing}
                  onClick={testProvider}
                >
                  {testing ? <Loader2 className="size-3.5 animate-spin" /> : <FlaskConical className="size-3.5" />}
                  {testing ? t("testing") : t("test")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="cursor-pointer"
                  disabled={savingKey || (!apiKey.trim() && provider !== "compatible")}
                  onClick={saveKey}
                >
                  {savingKey ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  {savingKey ? t("savingKey") : t("saveKey")}
                </Button>
              </div>
            </div>

            {/* Os dois níveis */}
            <div className="space-y-3">
              <p className="text-sm font-medium">{t("modelsTitle")}</p>
              {tierEditor(t("fastLabel"), t("fastDesc"), fast, setFast, "ai-fast")}
              {tierEditor(t("smartLabel"), t("smartDesc"), smart, setSmart, "ai-smart")}
            </div>

            {/* Teto mensal */}
            <div className="space-y-2">
              <Label htmlFor="ai-budget" className="text-sm">
                {t("budgetLabel")}
              </Label>
              <Input
                id="ai-budget"
                inputMode="decimal"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder={t("budgetPlaceholder")}
                className="sm:w-56"
              />
              <p className="text-xs text-muted-foreground">{t("budgetHint")}</p>
              <p className="text-xs text-muted-foreground">
                {t("monthSpend", {
                  amount: money.format(data.usage.costUsd),
                  calls: data.usage.calls,
                })}
              </p>
            </div>

            <Button
              type="button"
              className="cursor-pointer"
              disabled={savingSettings}
              onClick={saveModelsAndBudget}
            >
              {savingSettings ? <Loader2 className="size-4 animate-spin" /> : null}
              {savingSettings ? t("saving") : t("save")}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
