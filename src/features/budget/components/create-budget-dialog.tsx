"use client"

import { useState, useTransition, useMemo } from "react"
import { useTranslations } from "next-intl"
import { Save, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DetailPanel } from "@/components/detail-panel"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createBudgetItem } from "../services/create-budget-item"
import { saveCustomBudgetCard } from "../services/save-budget-formula"
import { resolveCategoryLabel, resolveGroupLabel } from "@/i18n/chart-labels"
import type { GroupWithCategories, BudgetItem } from "../types"
import { useRouter } from "next/navigation"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"

// Chaves de dados: nomes de grupos vindos do banco (pt), usados só para casar emoji.
const GROUP_EMOJI_MAP: Record<string, string> = {
  receitas: "💰",
  "habitação": "🏠", // i18n-ignore — chave de dado (nome de grupo no banco), não é UI
  habitacao: "🏠",
  "alimentação": "🍔", // i18n-ignore — chave de dado (nome de grupo no banco), não é UI
  alimentacao: "🍔",
  "saúde": "🏥", // i18n-ignore — chave de dado (nome de grupo no banco), não é UI
  saude: "🏥",
  "educação": "🎓", // i18n-ignore — chave de dado (nome de grupo no banco), não é UI
  educacao: "🎓",
  transporte: "🚗",
  "vestuário": "👕", // i18n-ignore — chave de dado (nome de grupo no banco), não é UI
  vestuario: "👕",
  "serviços": "🛠️", // i18n-ignore — chave de dado (nome de grupo no banco), não é UI
  servicos: "🛠️",
  lazer: "🎭",
  turismo: "✈️",
  pet: "🐾",
  impostos: "🏛️",
  "outras despesas": "📦",
  "caixa e captação": "💳", // i18n-ignore — chave de dado (nome de grupo no banco), não é UI
  "caixa e captacao": "💳",
  financeira: "📊",
}

interface CreateBudgetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groups: GroupWithCategories[]
  editItem?: BudgetItem
}

export function CreateBudgetDialog({
  open,
  onOpenChange,
  groups,
  editItem,
}: CreateBudgetDialogProps) {
  const t = useTranslations("budget.createDialog")
  const tBudget = useTranslations("budget")
  const tCommon = useTranslations("common")
  // Raiz do next-intl: os helpers de rotulo do plano de contas usam a chave completa.
  const tRoot = useTranslations()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  
  // Track default tab
  const defaultTab = editItem?.id.startsWith("custom_") ? "agregado" : "simples"
  
  const [selectedGroupId, setSelectedGroupId] = useState(editItem?.groupId || "")
  const [selectedCategoryId, setSelectedCategoryId] = useState(editItem?.categoryId || "")
  const [customName, setCustomName] = useState(editItem?.name === editItem?.originalName ? "" : (editItem?.name || ""))
  const [amount, setAmount] = useState(editItem?.amountSetting?.toString() || "")

  const [selectedMultiGroups, setSelectedMultiGroups] = useState<string[]>(editItem?.groupIds || [])
  const [selectedMultiCats, setSelectedMultiCats] = useState<string[]>(editItem?.categoryIds || [])

  // Override initial state when editItem changes or modal opens
  useMemo(() => {
    if (open) {
      if (editItem) {
        setSelectedGroupId(editItem.groupId || "")
        setSelectedCategoryId(editItem.categoryId || "")
        setCustomName(editItem.name === editItem.originalName ? "" : (editItem.name || ""))
        setAmount(editItem.amountSetting?.toString() || "")
        setSelectedMultiGroups(editItem.groupIds || [])
        setSelectedMultiCats(editItem.categoryIds || [])
      } else {
        setSelectedGroupId("")
        setSelectedCategoryId("")
        setCustomName("")
        setAmount("")
        setSelectedMultiGroups([])
        setSelectedMultiCats([])
      }
    }
  }, [open, editItem])

  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId),
    [groups, selectedGroupId]
  )

  const groupEmoji = selectedGroup
    ? GROUP_EMOJI_MAP[selectedGroup.name.toLowerCase()] || "📁"
    : "📁"

  const handleGroupChange = (id: string) => {
    setSelectedGroupId(id)
    setSelectedCategoryId("")
  }

  const handleSave = () => {
    const numAmount = parseFloat(amount) || 0

    const isAggregated = selectedMultiGroups.length > 0 || selectedMultiCats.length > 0

    if (!isAggregated && !selectedGroupId) return

    startTransition(async () => {
      if (isAggregated) {
        await saveCustomBudgetCard({
          id: editItem?.id.startsWith("custom_") ? editItem.id : `custom_${Date.now()}`,
          name: customName.trim() || t("customFallbackName"),
          groupIds: selectedMultiGroups,
          categoryIds: selectedMultiCats,
          amount: numAmount
        })
      } else {
        await createBudgetItem({
          groupId: selectedGroupId,
          categoryId: selectedCategoryId && selectedCategoryId !== "none" ? selectedCategoryId : undefined,
          customName: customName.trim() || undefined,
          amount: numAmount,
        })
      }

      // Reset and close
      setSelectedGroupId("")
      setSelectedCategoryId("")
      setSelectedMultiGroups([])
      setSelectedMultiCats([])
      setCustomName("")
      setAmount("")
      onOpenChange(false)
      router.refresh()
    })
  }

  const isValid = (selectedGroupId || selectedMultiGroups.length > 0 || selectedMultiCats.length > 0)

  return (
    <DetailPanel
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-lg">
            {selectedCategoryId ? "📌" : groupEmoji}
          </span>
          <span>{editItem ? t("editTitle") : tBudget("newBudget")}</span>
        </span>
      }
      description={editItem ? t("editDescription") : t("newDescription")}
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {tCommon("cancel")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={isPending || !isValid}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            {tCommon("confirm")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {editItem ? t("editDescription") : t("newDescription")}
        </p>
        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className="w-full flex">
            <TabsTrigger value="simples" className="flex-1">{t("simpleTab")}</TabsTrigger>
            <TabsTrigger value="agregado" className="flex-1">{t("aggregatedTab")}</TabsTrigger>
          </TabsList>

          <TabsContent value="simples" className="flex flex-col gap-4 mt-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {t("groupLabel")} *
              </Label>
              <Select value={selectedGroupId} onValueChange={handleGroupChange}>
                <SelectTrigger>
                  <SelectValue placeholder={t("groupPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      <span className="flex items-center gap-2">
                        <span>
                          {GROUP_EMOJI_MAP[g.name.toLowerCase()] || "📁"}
                        </span>
                        <span>{resolveGroupLabel(tRoot, g)}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {t("categoryLabel")}
              </Label>
              <Select
                value={selectedCategoryId}
                onValueChange={setSelectedCategoryId}
                disabled={!selectedGroup}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("categoryNone")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    {t("categoryNone")}
                  </SelectItem>
                  {selectedGroup?.categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      📌 {resolveCategoryLabel(tRoot, c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          <TabsContent value="agregado" className="flex flex-col gap-4 mt-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {t("componentsLabel")} *
              </Label>
              <ScrollArea className="h-[200px] rounded-md border p-4">
                <div className="flex flex-col gap-4">
                  {groups.map((g) => (
                    <div key={g.id} className="flex flex-col gap-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id={`grp-${g.id}`}
                          checked={selectedMultiGroups.includes(g.id)}
                          onCheckedChange={(checked) => {
                            if (checked) setSelectedMultiGroups(prev => [...prev, g.id])
                            else setSelectedMultiGroups(prev => prev.filter(id => id !== g.id))
                          }}
                        />
                        <Label htmlFor={`grp-${g.id}`} className="font-semibold text-sm">
                          {GROUP_EMOJI_MAP[g.name.toLowerCase()] || "📁"} {resolveGroupLabel(tRoot, g)}
                        </Label>
                      </div>
                      <div className="flex flex-col gap-2 pl-6">
                        {g.categories.map((c) => (
                          <div key={c.id} className="flex items-center space-x-2">
                            <Checkbox 
                              id={`cat-${c.id}`}
                              checked={selectedMultiCats.includes(c.id)}
                              onCheckedChange={(checked) => {
                                if (checked) setSelectedMultiCats(prev => [...prev, c.id])
                                else setSelectedMultiCats(prev => prev.filter(id => id !== c.id))
                              }}
                            />
                            <Label htmlFor={`cat-${c.id}`} className="text-sm font-normal text-muted-foreground cursor-pointer">
                              📌 {resolveCategoryLabel(tRoot, c)}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>

        {/* Removed Categories single select since it's in Tabs */}

        {/* Custom name */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {t("nicknameLabel")}
          </Label>
          <Input
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder={t("nicknamePlaceholder")}
          />
        </div>

        {/* Amount */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {t("amountLabel")}
          </Label>
          <div className="relative">
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={t("amountPlaceholder")}
              className="tabular-nums font-mono font-normal text-sm"
              min={0}
              step={50}
            />
          </div>
        </div>
      </div>
    </DetailPanel>
  )
}
