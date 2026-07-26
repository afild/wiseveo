"use client"

import * as React from "react"
import type { Header } from "@tanstack/react-table"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { TableHead } from "@/components/ui/table"

interface DraggableTableHeadProps<TData, TValue> {
  header: Header<TData, TValue>
  fixed: boolean
  children: React.ReactNode
}

/**
 * TableHead com as três zonas de gesto separadas: a alça (arrasta a coluna),
 * o conteúdo (clique ordena) e o handle da borda direita (redimensiona).
 * Os listeners do dnd-kit ficam SÓ na alça — é o que impede um gesto de invadir o outro.
 */
export function DraggableTableHead<TData, TValue>({
  header,
  fixed,
  children,
}: DraggableTableHeadProps<TData, TValue>) {
  const t = useTranslations("common.dataTable.header")
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id: header.column.id,
    disabled: fixed,
  })

  return (
    <TableHead
      ref={setNodeRef}
      colSpan={header.colSpan}
      className={cn("relative", isDragging && "z-30 opacity-80")}
      style={{ width: header.getSize(), transform: CSS.Translate.toString(transform) }}
    >
      <div className="flex items-center gap-0.5">
        {!fixed && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="text-muted-foreground/50 hover:text-foreground -ml-1 shrink-0 cursor-grab touch-none rounded p-0.5 active:cursor-grabbing"
          >
            <GripVertical className="size-3.5" />
            <span className="sr-only">{t("dragColumn")}</span>
          </button>
        )}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      {header.column.getCanResize() && (
        <div
          role="separator"
          aria-label={t("resizeColumn")}
          onDoubleClick={() => header.column.resetSize()}
          onMouseDown={(e) => {
            // Sem o stopPropagation o gesto de resize dispara a ordenação.
            e.stopPropagation()
            header.getResizeHandler()(e)
          }}
          onTouchStart={header.getResizeHandler()}
          className={cn(
            "absolute top-0 right-0 h-full w-1.5 cursor-col-resize touch-none select-none",
            "hover:bg-primary/40",
            header.column.getIsResizing() && "bg-primary"
          )}
        />
      )}
    </TableHead>
  )
}
