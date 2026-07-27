"use client"

import { useState, useTransition, useEffect, useRef } from "react"
import { useTranslations } from "next-intl"
import { format } from "date-fns"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable"
import { restrictToFirstScrollableAncestor } from "@dnd-kit/modifiers"
import { useDateRange } from "@/contexts/date-range-context"

import { BudgetHeroFold } from "./budget-hero-fold"
import { BudgetItemCard } from "./budget-item-card"
import { BudgetSortableItem } from "./budget-sortable-item"
import { BudgetSummaryCards } from "./budget-summary-cards"
import { BudgetAttentionModule } from "./budget-attention-module"
import { FormulaManagerCard } from "./formula-manager-card"
import { NewBudgetCard } from "./new-budget-card"
import { CreateBudgetDialog } from "./create-budget-dialog"
import { updateBudgetOrder } from "../services/update-budget-order"
import { SectionCardsGrid } from "@/components/section-cards-grid"
import { Skeleton } from "@/components/ui/skeleton"
import type { BudgetPageData, BudgetItem } from "../types"

interface BudgetClientProps {
  data: BudgetPageData
}

export function BudgetClient({ data: initialData }: BudgetClientProps) {
  const t = useTranslations("budget")
  const { dateRange } = useDateRange()
  const [data, setData] = useState<BudgetPageData>(initialData)
  const [items, setItems] = useState(data.items)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [loading, setLoading] = useState(false)
  const [editItem, setEditItem] = useState<BudgetItem | null>(null)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const latestRequestRef = useRef(0)

  const handleEdit = (item: BudgetItem) => {
    setEditItem(item)
    setIsEditOpen(true)
  }

  const commitOrder = (newItems: BudgetItem[]) => {
    setItems(newItems)
    startTransition(async () => {
      await updateBudgetOrder(newItems.map((it) => it.id))
    })
  }

  const handleMove = (itemId: string, delta: -1 | 1) => {
    const idx = items.findIndex((it) => it.id === itemId)
    const target = idx + delta
    if (idx < 0 || target < 0 || target >= items.length) return
    commitOrder(arrayMove(items, idx, target))
  }

  // Refetch quando o dateRange muda OU quando initialData troca de referência —
  // esta segunda é a assinatura de um router.refresh() disparado por mutação
  // (aplicar fórmula, excluir card/preset). Sem ela o estado do cliente ficava
  // preso ao snapshot do mount e só um F5 mostrava os novos limites. Buscar via
  // API (e não sincronizar initialData direto) preserva o range selecionado:
  // o server component sempre calcula o mês corrente.
  useEffect(() => {
    const fetchBudgetData = async () => {
      const requestId = ++latestRequestRef.current
      setLoading(true)
      try {
        // Data de calendário, não instante: um ISO com hora é lido pelo servidor
        // no fuso DELE e, na virada do mês, arrastava o mês seguinte inteiro
        // para dentro do range (ver features/budget/lib/period-range.ts).
        const params = new URLSearchParams({
          from: format(dateRange.from, "yyyy-MM-dd"),
          to: format(dateRange.to, "yyyy-MM-dd"),
        })
        const res = await fetch(`/api/budget?${params}`, { cache: "no-store" })
        if (!res.ok) throw new Error("Failed to fetch budget data") // i18n-ignore: mensagem interna de Error, só logada (console.error), nunca exibida ao usuário
        const newData = await res.json()

        if (requestId !== latestRequestRef.current) return

        setData(newData)
        setItems(newData.items)
      } catch (error) {
        if (requestId !== latestRequestRef.current) return
        console.error("Failed to fetch budget data:", error)
      } finally {
        if (requestId !== latestRequestRef.current) return
        setLoading(false)
      }
    }

    fetchBudgetData()
  }, [dateRange, initialData])

  // Sync items when data.items changes (e.g. after fetch)
  useEffect(() => {
    setItems(data.items)
  }, [data.items])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((it) => it.id === active.id)
      const newIndex = items.findIndex((it) => it.id === over.id)
      commitOrder(arrayMove(items, oldIndex, newIndex))
    }
  }

  const hasAnyHistory = items.some((it) => it.hasHistory)

  return (
    <>
      {/* Summary Cards */}
      <div className="px-4 lg:px-6" aria-busy={loading}>
        <BudgetSummaryCards
          totalLimit={data.totalLimit}
          totalSpent={data.totalSpent}
          totalPaid={data.totalPaid}
          totalScheduled={data.totalScheduled}
          overallPct={data.overallPct}
          itemCount={items.length}
        />
      </div>

      {/* Visualization Row (12-col: Hero 8 + Fórmula 4) */}
      <div className="px-4 lg:px-6" aria-busy={loading}>
        <div className="grid grid-cols-12 items-stretch gap-4">
          <div className="col-span-12 lg:col-span-8">
            {loading ? (
              <div className="h-full space-y-3 rounded-xl border p-6">
                <Skeleton className="h-9 w-44" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-1 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : (
              <BudgetHeroFold
                totalLimit={data.totalLimit}
                totalSpent={data.totalSpent}
                totalPaid={data.totalPaid}
                totalScheduled={data.totalScheduled}
                totalProjected={data.totalProjected}
                overallPct={data.overallPct}
              />
            )}
          </div>
          <div className="col-span-12 lg:col-span-4 *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs">
            <FormulaManagerCard
              formulaConfig={data.formulaConfig}
              hasAnyHistory={hasAnyHistory}
              items={items}
              incomeWindow={data.incomeWindow ?? []}
            />
          </div>
        </div>
      </div>

      {/* Needs Attention */}
      {!loading && <BudgetAttentionModule items={items} />}

      {/* Sortable Budget Cards */}
      <div className="px-4 lg:px-6" aria-busy={loading}>
        {isPending && (
          <p className="text-xs text-muted-foreground animate-pulse mb-2">
            {t("client.savingOrder")}
          </p>
        )}
        {loading && (
          <p className="text-xs text-muted-foreground animate-pulse mb-2">
            {t("client.updatingBudget")}
          </p>
        )}
        <DndContext
          id="budget-dnd-context"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToFirstScrollableAncestor]}
        >
          <SortableContext items={items.map((it) => it.id)} strategy={rectSortingStrategy}>
            <SectionCardsGrid className="lg:grid-cols-3 xl:grid-cols-3">
              {items.map((item, index) => (
                <BudgetSortableItem
                  key={item.id}
                  item={item}
                  index={index}
                  formulaConfig={data.formulaConfig}
                  incomeWindow={data.incomeWindow ?? []}
                  onEdit={handleEdit}
                  onMoveUp={index > 0 ? () => handleMove(item.id, -1) : undefined}
                  onMoveDown={index < items.length - 1 ? () => handleMove(item.id, 1) : undefined}
                />
              ))}
              <NewBudgetCard groups={data.groups} />
            </SectionCardsGrid>
          </SortableContext>

          <DragOverlay adjustScale={true}>
            {activeId ? (
              <BudgetItemCard
                item={items.find((it) => it.id === activeId)!}
                index={items.findIndex((it) => it.id === activeId)}
                formulaConfig={data.formulaConfig}
                isDragging
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Edit Dialog */}
      <CreateBudgetDialog
        open={isEditOpen}
        onOpenChange={(open) => {
          setIsEditOpen(open)
          if (!open) setTimeout(() => setEditItem(null), 300)
        }}
        groups={data.groups}
        editItem={editItem || undefined}
      />
    </>
  )
}
