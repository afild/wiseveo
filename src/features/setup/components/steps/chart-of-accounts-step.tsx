"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  LayoutList,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react"
import { resolveChartChoice } from "../../lib/chart-choice"
import type { DbAudit, ExistingChart } from "../../lib/connection-result"
import type { SchemaCheck } from "../../lib/schema-check"

// Default groups and categories matching prisma/data/default-chart-of-accounts.ts.
// These names are SEED DATA (editable defaults persisted to the DB, mirroring the
// backend seed) — not UI copy — so they are exempt from i18n (i18n-ignore below).
const defaultChartOfAccounts = [
  {
    id: "grp-income-100",
    code: 100,
    name: "RECEITAS E RENDIMENTOS", // i18n-ignore
    type: "INCOME" as const,
    categories: [
      { id: "cat-salario", code: "100.001", name: "Salário" }, // i18n-ignore
      { id: "cat-freelance", code: "100.002", name: "Freelance / Serviços" }, // i18n-ignore
      { id: "cat-rendimentos", code: "100.003", name: "Rendimentos" },
    ],
  },
  {
    id: "grp-housing-200",
    code: 200,
    name: "MORADIA",
    type: "EXPENSE" as const,
    categories: [
      { id: "cat-aluguel", code: "200.001", name: "Aluguel / Prestação" }, // i18n-ignore
      { id: "cat-condominio", code: "200.002", name: "Condomínio" }, // i18n-ignore
      { id: "cat-consumo", code: "200.003", name: "Contas de Consumo (Luz/Água/Gás)" }, // i18n-ignore
      { id: "cat-internet", code: "200.004", name: "Internet / TV" },
    ],
  },
  {
    id: "grp-food-300",
    code: 300,
    name: "ALIMENTAÇÃO", // i18n-ignore
    type: "EXPENSE" as const,
    categories: [
      { id: "cat-supermercado", code: "300.001", name: "Supermercado" },
      { id: "cat-restaurantes", code: "300.002", name: "Restaurantes / Delivery" },
    ],
  },
  {
    id: "grp-transport-400",
    code: 400,
    name: "TRANSPORTE",
    type: "EXPENSE" as const,
    categories: [
      { id: "cat-combustivel", code: "400.001", name: "Combustível" }, // i18n-ignore
      { id: "cat-transp-publico", code: "400.002", name: "Transporte Público / Uber" }, // i18n-ignore
      { id: "cat-manut-veiculo", code: "400.003", name: "Manutenção Veículo" }, // i18n-ignore
    ],
  },
  {
    id: "grp-health-500",
    code: 500,
    name: "SAÚDE", // i18n-ignore
    type: "EXPENSE" as const,
    categories: [
      { id: "cat-saude-geral", code: "500.001", name: "Plano de Saúde / Farmácia" }, // i18n-ignore
    ],
  },
  {
    id: "grp-leisure-600",
    code: 600,
    name: "LAZER E ESTILO DE VIDA", // i18n-ignore
    type: "EXPENSE" as const,
    categories: [
      { id: "cat-cinema", code: "600.001", name: "Cinema / Shows / Viagens" },
      { id: "cat-assinaturas", code: "600.002", name: "Assinaturas (Netflix, Spotify, etc.)" },
    ],
  },
  {
    id: "grp-education-700",
    code: 700,
    name: "EDUCAÇÃO", // i18n-ignore
    type: "EXPENSE" as const,
    categories: [
      { id: "cat-cursos", code: "700.001", name: "Cursos / Faculdade / Livros" },
    ],
  },
  {
    id: "grp-others-800",
    code: 800,
    name: "OUTROS",
    type: "EXPENSE" as const,
    categories: [
      { id: "cat-despesas-diversas", code: "800.001", name: "Despesas Diversas" }, // i18n-ignore
      { id: "cat-impostos", code: "800.002", name: "Impostos / Tarifas" },
    ],
  },
  {
    id: "grp-transfer-900",
    code: 900,
    name: "TRANSFERÊNCIAS", // i18n-ignore
    type: "TRANSFER" as const,
    categories: [
      { id: "cat-transferencia", code: "900.001", name: "Transferência entre Contas" }, // i18n-ignore
    ],
  },
]

const defaultAccounts = [
  { id: 1, name: "Conta Corrente", type: "CHECKING" }, // i18n-ignore
  { id: 2, name: "Reserva Financeira", type: "SAVINGS" }, // i18n-ignore
  { id: 3, name: "Carteira", type: "WALLET" },
]

const typeIcons: Record<string, React.ReactNode> = {
  INCOME: <TrendingUp className="w-4 h-4 text-positive" />,
  EXPENSE: <TrendingDown className="w-4 h-4 text-destructive" />,
  TRANSFER: <ArrowLeftRight className="w-4 h-4 text-info" />,
}

interface ChartOfAccountsStepProps {
  /** Banco conectado já tem o esquema/dados do WISEVEO (tabela `transactions` existe). */
  hasData: boolean
  audit: DbAudit | null
  existingChart: ExistingChart | null
  schemaCheck: SchemaCheck | null
  onNext: () => void
  onBack: () => void
}

/**
 * Cartão de escolha. Não há clique nem papel ARIA de rádio: quem decide é o estado
 * do banco (resolveChartChoice) — o cartão só mostra, em texto, se está valendo e por quê.
 */
function ChoiceCard({
  selected,
  icon,
  title,
  description,
  unavailable,
  children,
}: {
  selected: boolean
  icon: React.ReactNode
  title: string
  description: string
  unavailable: string
  children?: React.ReactNode
}) {
  return (
    <div
      data-selected={selected}
      className={cn(
        "rounded-xl border p-4 transition-colors",
        selected ? "border-primary bg-primary/5" : "border-dashed border-border bg-muted/20 opacity-70",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border",
            selected ? "border-primary" : "border-muted-foreground/40",
          )}
        >
          {selected && <span className="size-2 rounded-full bg-primary" />}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            {icon}
            {title}
          </p>
          <p className="text-xs text-muted-foreground">{selected ? description : unavailable}</p>
          {selected && children}
        </div>
      </div>
    </div>
  )
}

/** Conteúdo integral do banco, recolhido e só leitura — exatamente como o teste leu. */
function DatabaseContents({ chart }: { chart: ExistingChart }) {
  const t = useTranslations("setup.chartOfAccounts")
  const [open, setOpen] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border border-dashed border-border bg-background/60">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-foreground"
        >
          <span>{t("contentsToggle")}</span>
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 border-t border-dashed border-border px-3 pb-3 pt-3">
        <p className="text-[11px] text-muted-foreground">{t("contentsNote")}</p>

        <div className="space-y-1.5">
          <h4 className="flex items-center gap-2 text-xs font-semibold">
            <Wallet className="size-3.5" />
            {t("bankAccounts")}
          </h4>
          <div className="max-h-[200px] space-y-1.5 overflow-y-auto pr-1">
            {chart.accounts.map((account, index) => (
              <div key={`${String(account.id)}-${index}`} className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-1.5">
                <span className="flex-1 text-xs">{String(account.name)}</span>
                <span className="text-[10px] uppercase text-muted-foreground">{String(account.type)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <h4 className="flex items-center gap-2 text-xs font-semibold">
            <LayoutList className="size-3.5" />
            {t("groupsAndCategories")}
          </h4>
          <div className="max-h-[280px] space-y-1 overflow-y-auto pr-1">
            {chart.groups.map((group) => {
              const id = String(group.id)
              const isExpanded = expandedGroups.has(id)
              return (
                <div key={id} className="overflow-hidden rounded-lg border border-muted">
                  <button
                    type="button"
                    onClick={() => toggleGroup(id)}
                    aria-expanded={isExpanded}
                    className="flex w-full items-center gap-2 bg-muted/30 px-3 py-2 text-left transition-colors hover:bg-muted/50"
                  >
                    {isExpanded ? (
                      <ChevronDown className="size-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-3.5 text-muted-foreground" />
                    )}
                    {typeIcons[String(group.type)]}
                    <span className="flex-1 truncate text-xs font-semibold">{String(group.name)}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{group.categories.length}</span>
                  </button>
                  {isExpanded && (
                    <div className="space-y-1 px-3 py-2 animate-in fade-in duration-200">
                      {group.categories.map((cat) => (
                        <div key={String(cat.id)} className="flex items-center gap-2 pl-6">
                          <span className="w-14 font-mono text-[10px] text-muted-foreground">{String(cat.code)}</span>
                          <span className="text-xs">{String(cat.name)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** Modelo padrão editável — só aparece em banco vazio (comportamento anterior, intocado). */
function TemplateEditor() {
  const t = useTranslations("setup.chartOfAccounts")
  const [groups, setGroups] = useState(defaultChartOfAccounts)
  const [accounts, setAccounts] = useState(defaultAccounts)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [newCategoryInputs, setNewCategoryInputs] = useState<Record<string, string>>({})
  const [newAccountName, setNewAccountName] = useState("")

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const updateGroupName = (groupId: string, name: string) => {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, name } : g)))
  }

  const updateCategoryName = (groupId: string, catId: string, name: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId ? { ...g, categories: g.categories.map((c) => (c.id === catId ? { ...c, name } : c)) } : g,
      ),
    )
  }

  const removeCategory = (groupId: string, catId: string) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, categories: g.categories.filter((c) => c.id !== catId) } : g)),
    )
  }

  const addCategory = (groupId: string) => {
    const name = newCategoryInputs[groupId]?.trim()
    if (!name) return
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g
        const nextCode = `${g.code}.${String(g.categories.length + 1).padStart(3, "0")}`
        return { ...g, categories: [...g.categories, { id: `cat-new-${Date.now()}`, code: nextCode, name }] }
      }),
    )
    setNewCategoryInputs((prev) => ({ ...prev, [groupId]: "" }))
  }

  const addAccount = () => {
    if (!newAccountName.trim()) return
    setAccounts((prev) => [...prev, { id: Date.now(), name: newAccountName.trim(), type: "CHECKING" }])
    setNewAccountName("")
  }

  const removeAccount = (accountId: number) => {
    setAccounts((prev) => prev.filter((a) => a.id !== accountId))
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Wallet className="size-4" />
          {t("bankAccounts")}
        </h3>
        <div className="space-y-1.5">
          {accounts.map((account) => (
            <div key={account.id} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
              <span className="flex-1 text-sm">{account.name}</span>
              <span className="text-[10px] uppercase text-muted-foreground">{account.type}</span>
              {accounts.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeAccount(account.id)}
                  className="cursor-pointer text-muted-foreground transition-colors hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          ))}
          <div className="flex gap-2">
            <Input
              value={newAccountName}
              onChange={(e) => setNewAccountName(e.target.value)}
              placeholder={t("newAccountPlaceholder")}
              className="h-8 text-sm"
              onKeyDown={(e) => e.key === "Enter" && addAccount()}
            />
            <Button variant="outline" size="sm" onClick={addAccount} className="h-8 shrink-0">
              <Plus className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <LayoutList className="size-4" />
          {t("groupsAndCategories")}
        </h3>
        <div className="max-h-[320px] space-y-1 overflow-y-auto pr-1">
          {groups.map((group) => {
            const isExpanded = expandedGroups.has(group.id)
            return (
              <div key={group.id} className="overflow-hidden rounded-lg border border-muted">
                <div
                  className="flex cursor-pointer items-center gap-2 bg-muted/30 px-3 py-2 transition-colors hover:bg-muted/50"
                  onClick={() => toggleGroup(group.id)}
                >
                  {isExpanded ? (
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-3.5 text-muted-foreground" />
                  )}
                  {typeIcons[group.type]}
                  <Input
                    value={group.name}
                    onChange={(e) => {
                      e.stopPropagation()
                      updateGroupName(group.id, e.target.value)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="h-6 border-none bg-transparent p-0 text-xs font-semibold shadow-none focus-visible:ring-0"
                  />
                  <span className="shrink-0 text-[10px] text-muted-foreground">{group.categories.length}</span>
                </div>
                {isExpanded && (
                  <div className="space-y-1 px-3 py-2 animate-in fade-in duration-200">
                    {group.categories.map((cat) => (
                      <div key={cat.id} className="flex items-center gap-2 pl-6">
                        <span className="w-14 font-mono text-[10px] text-muted-foreground">{cat.code}</span>
                        <Input
                          value={cat.name}
                          onChange={(e) => updateCategoryName(group.id, cat.id, e.target.value)}
                          className="h-6 border-none bg-transparent p-0 text-xs shadow-none focus-visible:ring-0"
                        />
                        <button
                          type="button"
                          onClick={() => removeCategory(group.id, cat.id)}
                          className="shrink-0 cursor-pointer text-muted-foreground transition-colors hover:text-destructive"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 pl-6">
                      <Input
                        value={newCategoryInputs[group.id] || ""}
                        onChange={(e) => setNewCategoryInputs((prev) => ({ ...prev, [group.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && addCategory(group.id)}
                        placeholder={t("newCategoryPlaceholder")}
                        className="h-6 border-none bg-transparent p-0 text-xs shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/40"
                      />
                      <button
                        type="button"
                        onClick={() => addCategory(group.id)}
                        className="shrink-0 cursor-pointer text-muted-foreground transition-colors hover:text-primary"
                      >
                        <Plus className="size-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function ChartOfAccountsStep({ hasData, audit, existingChart, schemaCheck, onNext, onBack }: ChartOfAccountsStepProps) {
  const t = useTranslations("setup.chartOfAccounts")
  const tc = useTranslations("setup.common")
  const choice = resolveChartChoice(hasData)
  // Coluna faltando em `users`: o Finalizar falharia (e o login depois) — bloqueia aqui.
  const schemaBlocked = hasData && schemaCheck?.ok === false

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="text-center">
        <div className="mb-3 inline-flex rounded-xl border border-primary/20 bg-primary/10 p-3">
          <LayoutList className="size-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">{t("title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{hasData ? t("subtitleExisting") : t("subtitleEditable")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ChoiceCard
          selected={choice === "existing"}
          icon={<Database className="size-4 text-primary" />}
          title={t("choiceExistingTitle")}
          description={t("choiceExistingDesc")}
          unavailable={t("choiceExistingUnavailable")}
        >
          {audit && (
            <p className="text-xs font-medium text-foreground">
              {t("stats", {
                transactions: audit.transactions,
                accounts: audit.accounts,
                categories: audit.categories,
                groups: audit.groups,
              })}
            </p>
          )}
          {schemaCheck &&
            (schemaCheck.ok ? (
              <p className="flex items-center gap-1.5 text-xs text-positive">
                <CheckCircle2 className="size-3.5" />
                {t("schemaOk")}
              </p>
            ) : (
              <div role="alert" className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
                <p className="flex items-center gap-1.5 font-medium text-foreground">
                  <AlertTriangle className="size-3.5 text-warning" />
                  {t("schemaMissing", { columns: schemaCheck.missingColumns.join(", ") })}
                </p>
                <p className="text-muted-foreground">{t("schemaMissingHint")}</p>
              </div>
            ))}
          {existingChart && <DatabaseContents chart={existingChart} />}
        </ChoiceCard>

        <ChoiceCard
          selected={choice === "template"}
          icon={<LayoutList className="size-4 text-primary" />}
          title={t("choiceTemplateTitle")}
          description={t("choiceTemplateDesc")}
          unavailable={t("choiceTemplateUnavailable")}
        />
      </div>

      {choice === "template" && <TemplateEditor />}

      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onBack} className="flex-1">
          {tc("back")}
        </Button>
        <Button onClick={onNext} disabled={schemaBlocked} className="flex-1">
          {tc("next")}
        </Button>
      </div>
    </div>
  )
}
