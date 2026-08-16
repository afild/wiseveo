"use client"

import type { Column } from "@tanstack/react-table"
import { ArrowDown, ArrowUp } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface DataTableColumnHeaderProps<TData, TValue>
  extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>
  title: string
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return (
      <div className={cn("truncate", className)} title={title}>
        {title}
      </div>
    )
  }

  // No layout "cabe no contêiner" a coluna pode ficar mais estreita que o rótulo: o
  // botão encolhe junto (min-w-0), o texto ganha reticências e o rótulo inteiro fica no
  // `title`. O ícone só aparece quando a coluna está ordenada (o par de setas em todas as
  // colunas custava 20px por cabeçalho); o hover do botão já sinaliza que ordena.
  const sorted = column.getIsSorted()

  return (
    <div className={cn("flex min-w-0 items-center", className)}>
      <Button
        variant="ghost"
        size="sm"
        title={title}
        className="-ml-1 h-8 min-w-0 shrink cursor-pointer justify-start gap-1 px-1 hover:bg-accent has-[>svg]:px-1"
        onClick={() => column.toggleSorting(sorted === "asc")}
      >
        <span className="truncate">{title}</span>
        {sorted === "desc" ? (
          <ArrowDown className="size-4 shrink-0" />
        ) : sorted === "asc" ? (
          <ArrowUp className="size-4 shrink-0" />
        ) : null}
      </Button>
    </div>
  )
}
