"use client"

import { motion } from "motion/react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { BudgetItemCard } from "./budget-item-card"
import type { BudgetItem, BudgetFormulaPreferences } from "../types"

interface BudgetSortableItemProps {
  item: BudgetItem
  index: number
  formulaConfig: BudgetFormulaPreferences
  incomeWindow?: number[]
  onEdit?: (item: BudgetItem) => void
  onMoveUp?: () => void
  onMoveDown?: () => void
}

export function BudgetSortableItem({
  item,
  index,
  formulaConfig,
  incomeWindow,
  onEdit,
  onMoveUp,
  onMoveDown,
}: BudgetSortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const dndStyle = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 0 : undefined,
    opacity: isDragging ? 0.3 : 1,
  }

  return (
    <motion.div
      ref={setNodeRef}
      style={dndStyle}
      layout
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 30,
      }}
    >
      <BudgetItemCard
        item={item}
        index={index}
        dragHandleProps={{ ...attributes, ...listeners }}
        formulaConfig={formulaConfig}
        incomeWindow={incomeWindow}
        onEdit={onEdit}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
      />
    </motion.div>
  )
}
