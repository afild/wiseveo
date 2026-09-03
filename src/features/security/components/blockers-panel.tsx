"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"

import { DetailPanel, DetailPanelCloseButton } from "@/components/detail-panel"
import { Button } from "@/components/ui/button"
import { useMonetaryFormattingSafe } from "@/hooks/use-monetary-formatting"
import { createDateFormatter } from "@/i18n/format"
import type { UnpaidBlockersView } from "../lib/switch-flows"

interface BlockersPanelProps {
  /** null = painel fechado. */
  blockers: UnpaidBlockersView | null
  onClose: () => void
  /**
   * "Ver esses lançamentos": leva o seletor de período para a faixa dos bloqueadores. Opcional
   * porque o seletor de período é por rota (a chave guardada é o caminho): em Configurações não
   * há para onde mandar a faixa, e o painel prefere não oferecer o atalho a oferecer um que
   * chegaria na tabela com outro período.
   */
  onViewBlockers?: (firstDate: string, lastDate: string) => void
}

/**
 * O que impediu o fechamento: os não pagos que caem dentro da faixa. O servidor manda contagem,
 * primeira e última data e uma amostra (até 20 linhas), então o painel nunca promete a lista
 * inteira: o botão joga o período em tela na faixa e a tabela mostra tudo.
 *
 * Valores em dinheiro seguem a preferência de moeda da pessoa (`useMonetaryFormattingSafe`), que
 * é independente do idioma da interface; datas seguem o idioma.
 */
export function BlockersPanel({ blockers, onClose, onViewBlockers }: BlockersPanelProps) {
  const t = useTranslations("transactions.closing")
  const locale = useLocale()
  const monetary = useMonetaryFormattingSafe()

  const dayFormatter = React.useMemo(
    () => createDateFormatter(locale, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }),
    [locale],
  )
  const formatDay = React.useCallback(
    (key: string) => dayFormatter.format(new Date(`${key}T12:00:00.000Z`)),
    [dayFormatter],
  )

  const firstDate = blockers?.firstDate ?? null
  const lastDate = blockers?.lastDate ?? null

  // O 409 pode chegar torto: contagem sem as datas da faixa, ou nem contagem. O painel diz o que
  // sabe em vez de mostrar só o título — quem abriu precisa saber o que fazer para poder fechar.
  const summary = !blockers
    ? null
    : firstDate && lastDate
      ? t("blockersDescription", { count: blockers.count, firstDate: formatDay(firstDate), lastDate: formatDay(lastDate) })
      : blockers.count > 0
        ? t("blockersDescriptionNoDates", { count: blockers.count })
        : t("blockersUnknown")

  return (
    <DetailPanel
      open={blockers !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title={t("blockersTitle")}
      description={t("blockersPanelDescription")}
      footer={
        <>
          <DetailPanelCloseButton onClick={onClose} />
          {firstDate && lastDate && onViewBlockers && (
            <Button
              type="button"
              className="cursor-pointer"
              onClick={() => {
                onViewBlockers(firstDate, lastDate)
                onClose()
              }}
            >
              {t("viewBlockers")}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {summary && <p className="text-muted-foreground text-sm">{summary}</p>}

        <ul className="flex flex-col gap-2">
          {blockers?.sample.map((row) => (
            <li key={row.id} className="flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm">
              <span className="flex min-w-0 flex-col">
                <span className="text-muted-foreground text-xs">{formatDay(row.date)}</span>
                {row.description && <span className="truncate font-medium">{row.description}</span>}
              </span>
              <span className="shrink-0 tabular-nums">{monetary.formatMonetaryValue(row.amount)}</span>
            </li>
          ))}
        </ul>
      </div>
    </DetailPanel>
  )
}
