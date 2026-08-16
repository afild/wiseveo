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
  /** Largura calculada pelo layout "cabe no contêiner" (px, ou % antes da medição). */
  width: number | string
  /** Mostra a alça de redimensionar (falso na última coluna flexível: sem vizinha à direita). */
  resizable: boolean
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
  width,
  resizable,
  children,
}: DraggableTableHeadProps<TData, TValue>) {
  const t = useTranslations("common.dataTable.header")
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id: header.column.id,
    disabled: fixed,
  })

  // O TanStack não expõe redimensionamento por teclado — só mouse/toque. Sem isto
  // o controle é inalcançável para quem navega sem ponteiro. Sem teto: no layout
  // "cabe no contêiner" a vizinha é quem limita (ver use-fitted-column-sizing.ts).
  const resizeBy = (delta: number) => {
    const { minSize = 64 } = header.column.columnDef
    header.getContext().table.setColumnSizing((old) => {
      // Parte do valor no estado, não de getSize(): duas teclas na mesma leva de
      // renderização leriam o mesmo tamanho antigo e uma delas se perderia.
      const currentSize = old[header.column.id] ?? header.getSize()
      return {
        ...old,
        [header.column.id]: Math.max(minSize, currentSize + delta),
      }
    })
  }

  const handleResizeKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault()
      resizeBy(-16)
    } else if (event.key === "ArrowRight") {
      event.preventDefault()
      resizeBy(16)
    } else if (event.key === "Enter" || event.key === "Home") {
      event.preventDefault()
      header.column.resetSize()
    }
  }

  return (
    <TableHead
      ref={setNodeRef}
      colSpan={header.colSpan}
      // overflow-hidden: cabeçalho estreito corta o rótulo em vez de invadir o vizinho.
      // pl-[18px] reserva a faixa da alça (posicionada sobre o padding, x = 2..14px; o botão
      // de ordenar começa em 14px, sem sobreposição): no layout "cabe no contêiner" cada
      // pixel de sobrecarga fixa tira espaço do rótulo.
      className={cn(
        "relative overflow-hidden",
        !fixed && "pl-[18px]",
        isDragging && "z-30 opacity-80",
      )}
      style={{ width, transform: CSS.Translate.toString(transform) }}
    >
      {!fixed && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="text-muted-foreground/50 hover:text-foreground absolute top-1/2 left-0.5 -translate-y-1/2 cursor-grab touch-none rounded px-0 py-0.5 active:cursor-grabbing"
        >
          <GripVertical className="size-3" />
          <span className="sr-only">{t("dragColumn")}</span>
        </button>
      )}
      {/* pr-1.5 é zona morta: sem ela o clique nos últimos pixels do cabeçalho cai no
          handle de resize e a ordenação falha em silêncio. */}
      <div className="min-w-0 pr-1.5">{children}</div>
      {resizable && (
        <div
          role="separator"
          aria-label={t("resizeColumn")}
          aria-orientation="vertical"
          tabIndex={0}
          onKeyDown={handleResizeKeyDown}
          onDoubleClick={() => header.column.resetSize()}
          onMouseDown={(e) => {
            // Sem o stopPropagation o gesto de resize dispara a ordenação.
            e.stopPropagation()
            header.getResizeHandler()(e)
          }}
          onTouchStart={header.getResizeHandler()}
          className={cn(
            "absolute top-0 right-0 h-full w-1.5 cursor-col-resize touch-none select-none",
            "hover:bg-primary/40 focus-visible:bg-primary focus-visible:outline-none",
            header.column.getIsResizing() && "bg-primary"
          )}
        />
      )}
    </TableHead>
  )
}
