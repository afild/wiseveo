"use client"

import * as React from "react"
import type { Column } from "@tanstack/react-table"
import { Check, ChevronDown, ListFilter } from "lucide-react"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"

interface DataTableFacetedFilterProps<TData, TValue> {
  column?: Column<TData, TValue>
  title: string
  options: { label: string; value: string }[]
}

export function DataTableFacetedFilter<TData, TValue>({
  column,
  title,
  options,
}: DataTableFacetedFilterProps<TData, TValue>) {
  const t = useTranslations("common.dataTable.facetedFilter")
  const facets = column?.getFacetedUniqueValues()
  const selected = new Set((column?.getFilterValue() as string[] | undefined) ?? [])

  const toggle = (value: string) => {
    const next = new Set(selected)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    column?.setFilterValue(next.size ? Array.from(next) : undefined)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-9 cursor-pointer",
            // Tracejado é ESTADO, não decoração: vazio tracejado, ativo sólido e destacado.
            selected.size > 0 ? "border-primary/40 bg-primary/5" : "border-dashed"
          )}
        >
          <ListFilter className="size-4" />
          {title}
          {selected.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-1 h-4" />
              <Badge variant="secondary" className="rounded-sm px-1 font-normal xl:hidden">
                {selected.size}
              </Badge>
              <div className="hidden gap-1 xl:flex">
                {selected.size > 2 ? (
                  <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                    {t("selected", { count: selected.size })}
                  </Badge>
                ) : (
                  options
                    .filter((o) => selected.has(o.value))
                    .map((o) => (
                      <Badge
                        key={o.value}
                        variant="secondary"
                        className="max-w-[7rem] truncate rounded-sm px-1 font-normal"
                      >
                        {o.label}
                      </Badge>
                    ))
                )}
              </div>
            </>
          )}
          <ChevronDown className="text-muted-foreground size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto min-w-[200px] max-w-[280px] p-0" align="start">
        <Command>
          {/* Busca só quando a lista justifica: acima de 3-4 opções ela é só mais
              uma parada de foco e mais altura no popover. */}
          {options.length >= 8 && <CommandInput placeholder={t("search")} />}
          <CommandList>
            <CommandEmpty>{t("noResults")}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selected.has(option.value)
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => toggle(option.value)}
                    className="cursor-pointer"
                  >
                    <div
                      className={cn(
                        "border-primary flex size-4 items-center justify-center rounded-sm border",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "opacity-50 [&_svg]:invisible"
                      )}
                    >
                      <Check className="size-3.5" />
                    </div>
                    <span>{option.label}</span>
                    {facets?.get(option.value) != null && (
                      <span className="text-muted-foreground ml-auto font-mono text-xs">
                        {facets.get(option.value)}
                      </span>
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {selected.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => column?.setFilterValue(undefined)}
                    className="justify-center text-center cursor-pointer"
                  >
                    {t("clear")}
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
