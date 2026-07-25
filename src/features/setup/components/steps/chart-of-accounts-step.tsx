"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  LayoutList,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowLeftRight,
} from "lucide-react"

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
  useExistingData: boolean
  onUseExistingDataChange: (value: boolean) => void
  existingChart: { groups: any[], accounts: any[] } | null
  onNext: () => void
  onBack: () => void
}

export function ChartOfAccountsStep({
  useExistingData,
  onUseExistingDataChange,
  existingChart,
  onNext,
  onBack,
}: ChartOfAccountsStepProps) {
  const t = useTranslations("setup.chartOfAccounts")
  const tc = useTranslations("setup.common")
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
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, name } : g))
    )
  }

  const updateCategoryName = (groupId: string, catId: string, name: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? {
              ...g,
              categories: g.categories.map((c) =>
                c.id === catId ? { ...c, name } : c
              ),
            }
          : g
      )
    )
  }

  const removeCategory = (groupId: string, catId: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, categories: g.categories.filter((c) => c.id !== catId) }
          : g
      )
    )
  }

  const addCategory = (groupId: string) => {
    const name = newCategoryInputs[groupId]?.trim()
    if (!name) return

    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g
        const nextCode = `${g.code}.${String(g.categories.length + 1).padStart(3, "0")}`
        return {
          ...g,
          categories: [
            ...g.categories,
            { id: `cat-new-${Date.now()}`, code: nextCode, name },
          ],
        }
      })
    )
    setNewCategoryInputs((prev) => ({ ...prev, [groupId]: "" }))
  }

  const addAccount = () => {
    if (!newAccountName.trim()) return
    setAccounts((prev) => [
      ...prev,
      { id: Date.now(), name: newAccountName.trim(), type: "CHECKING" },
    ])
    setNewAccountName("")
  }

  const removeAccount = (accountId: number) => {
    setAccounts((prev) => prev.filter((a) => a.id !== accountId))
  }


  const isReadOnly = useExistingData && existingChart !== null
  const displayGroups = isReadOnly ? existingChart.groups : groups
  const displayAccounts = isReadOnly ? existingChart.accounts : accounts

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="text-center">
        <div className="inline-flex p-3 rounded-xl bg-primary/10 border border-primary/20 mb-3">
          <LayoutList className="w-6 h-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">{t("title")}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {isReadOnly ? t("subtitleReadOnly") : t("subtitleEditable")}
        </p>
      </div>

      {existingChart && (
        <div className="flex rounded-lg bg-muted p-1">
          <button
            onClick={() => onUseExistingDataChange(true)}
            className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${useExistingData ? 'bg-background shadow font-medium' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {t("keepExisting")}
          </button>
          <button
            onClick={() => onUseExistingDataChange(false)}
            className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${!useExistingData ? 'bg-background shadow font-medium' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {t("createNew")}
          </button>
        </div>
      )}


      {/* Bank Accounts */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Wallet className="w-4 h-4" />
          {t("bankAccounts")}
        </h3>
        <div className="space-y-1.5">
          {displayAccounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50"
            >
              <span className="text-sm flex-1">{account.name}</span>
              <span className="text-[10px] text-muted-foreground uppercase">{account.type}</span>
              {!isReadOnly && displayAccounts.length > 1 && (
                <button
                  onClick={() => removeAccount(account.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
          {!isReadOnly && (
          <div className="flex gap-2">
            <Input
              value={newAccountName}
              onChange={(e) => setNewAccountName(e.target.value)}
              placeholder={t("newAccountPlaceholder")}
              className="text-sm h-8"
              onKeyDown={(e) => e.key === "Enter" && addAccount()}
            />
            <Button variant="outline" size="sm" onClick={addAccount} className="shrink-0 h-8">
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
        </div>
      </div>

      {/* Category Groups */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <LayoutList className="w-4 h-4" />
          {t("groupsAndCategories")}
        </h3>
        <div className="space-y-1 max-h-[320px] overflow-y-auto pr-1">
          {displayGroups.map((group) => {
            const isExpanded = expandedGroups.has(group.id)
            return (
              <div key={group.id} className="rounded-lg border border-muted overflow-hidden">
                {/* Group header */}
                <div
                  className="flex items-center gap-2 px-3 py-2 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleGroup(group.id)}
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                  {typeIcons[group.type]}
                  <Input
                    readOnly={isReadOnly}
                    value={group.name}
                    onChange={(e) => {
                      e.stopPropagation()
                      updateGroupName(group.id, e.target.value)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs font-semibold h-6 border-none bg-transparent p-0 shadow-none focus-visible:ring-0"
                  />
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {group.categories.length}
                  </span>
                </div>

                {/* Categories */}
                {isExpanded && (
                  <div className="px-3 py-2 space-y-1 animate-in fade-in duration-200">
                    {group.categories.map((cat: any) => (
                      <div key={cat.id} className="flex items-center gap-2 pl-6">
                        <span className="text-[10px] text-muted-foreground font-mono w-14">
                          {cat.code}
                        </span>
                        <Input
                          readOnly={isReadOnly}
                          value={cat.name}
                          onChange={(e) =>
                            updateCategoryName(group.id, cat.id, e.target.value)
                          }
                          className="text-xs h-6 border-none bg-transparent p-0 shadow-none focus-visible:ring-0"
                        />
                        {!isReadOnly && (
                        <button
                          onClick={() => removeCategory(group.id, cat.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors shrink-0 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                      </div>
                    ))}
                    {/* Add category */}
                    {!isReadOnly && (
                    <div className="flex items-center gap-2 pl-6">
                      <Input
                        value={newCategoryInputs[group.id] || ""}
                        onChange={(e) =>
                          setNewCategoryInputs((prev) => ({
                            ...prev,
                            [group.id]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => e.key === "Enter" && addCategory(group.id)}
                        placeholder={t("newCategoryPlaceholder")}
                        className="text-xs h-6 border-none bg-transparent p-0 shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/40"
                      />
                      <button
                        onClick={() => addCategory(group.id)}
                        className="text-muted-foreground hover:text-primary transition-colors shrink-0 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
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
