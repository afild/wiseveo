"use client"

import {
  ArrowDownCircle,
  ArrowRightLeft,
  ArrowUpCircle,
  ReceiptText,
} from "lucide-react"
import { useTranslations } from "next-intl"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useMonetaryFormattingSafe } from "@/hooks/use-monetary-formatting"
import { formatPercentValue } from "@/lib/monetary"
import { cn } from "@/lib/utils"
import type { DreData, DreLineItem } from "../types"

interface AnalysisStatementCardProps {
  data: DreData | null
  loading: boolean
}

interface StatementSectionProps {
  title: string
  items: DreLineItem[]
  total: number
  tone: "income" | "expense" | "transferIn" | "transferOut"
  totalLabel?: string
}

function StatementSection({
  title,
  items,
  total,
  tone,
  totalLabel,
}: StatementSectionProps) {
  const t = useTranslations("analysis")
  const monetary = useMonetaryFormattingSafe()
  const isIncome = tone === "income"
  const isExpense = tone === "expense"
  const isTransferIn = tone === "transferIn"
  const Icon = isIncome
    ? ArrowUpCircle
    : isExpense
      ? ArrowDownCircle
      : isTransferIn
        ? ArrowUpCircle
        : ArrowDownCircle
  const accentClass = isIncome
    ? "text-positive"
    : isExpense
      ? "text-destructive"
      : "text-primary"
  const formattedTotal = isIncome || isTransferIn
    ? monetary.formatMonetaryValue(total)
    : monetary.formatAbsoluteMonetaryValue(total)

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon
            className={cn("size-4", accentClass)}
          />
          <h3 className="text-sm font-semibold uppercase tracking-wide">
            {title}
          </h3>
        </div>
        <span className="text-xs text-muted-foreground">
          {t("groupsCount", { count: items.length })}
        </span>
      </div>

      {items.length ? (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={`${tone}-${item.groupCode}`}
              className="flex items-start justify-between gap-3 rounded-lg border bg-background/70 px-4 py-3"
            >
              <div className="min-w-0 space-y-1">
                <p className="truncate text-sm font-medium">{item.groupName}</p>
                <p className="text-xs text-muted-foreground">
                  {t("transactionsCount", { count: item.transactionCount })} ·{" "}
                  {formatPercentValue(item.percentage, 1)}
                </p>
              </div>
              <p
                className={cn(
                  "text-sm font-semibold tabular-nums",
                  accentClass,
                )}
              >
                {isIncome || isTransferIn
                  ? monetary.formatMonetaryValue(item.amount)
                  : monetary.formatAbsoluteMonetaryValue(item.amount)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed bg-background/40 px-4 py-5 text-sm text-muted-foreground">
          {t("statement.emptySection")}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 rounded-lg border bg-background px-4 py-3">
        <div>
          <p className="text-sm font-semibold">{totalLabel ?? (isIncome ? t("statement.totalIncome") : t("statement.totalExpense"))}</p>
          <p className="text-xs text-muted-foreground">
            {isIncome || isTransferIn ? "(+)" : "(-)"} {t("statement.consolidatedSum")}
          </p>
        </div>
        <p
          className={cn(
            "text-sm font-semibold tabular-nums",
            accentClass,
          )}
        >
          {formattedTotal}
        </p>
      </div>
    </section>
  )
}

function TransferSection({ data }: { data: DreData | null }) {
  const t = useTranslations("analysis")
  const monetary = useMonetaryFormattingSafe()
  const transferNet = (data?.summary.transferIn ?? 0) - (data?.summary.transferOut ?? 0)

  return (
    <section className="space-y-4 rounded-xl border bg-background/50 p-4">
      <div className="flex items-center gap-2">
        <ArrowRightLeft className="size-4 text-primary" />
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide">
            {t("statement.transferTitle")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t("statement.transferDescription")}
          </p>
        </div>
      </div>

      <StatementSection
        title={t("statement.transferInTitle")}
        items={data?.transferInGroups ?? []}
        total={data?.summary.transferIn ?? 0}
        tone="transferIn"
        totalLabel={t("statement.transferInTotal")}
      />

      <StatementSection
        title={t("statement.transferOutTitle")}
        items={data?.transferOutGroups ?? []}
        total={data?.summary.transferOut ?? 0}
        tone="transferOut"
        totalLabel={t("statement.transferOutTotal")}
      />

      <div className="flex items-center justify-between gap-4 rounded-xl border bg-background px-4 py-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold uppercase tracking-wide">
            {t("statement.transferNetTitle")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("statement.transferNetDescription")}
          </p>
        </div>
        <p
          className={cn(
            "text-lg font-semibold tabular-nums",
            transferNet < 0 ? "text-destructive" : "text-primary",
          )}
        >
          {monetary.formatMonetaryValue(transferNet)}
        </p>
      </div>
    </section>
  )
}

export function AnalysisStatementCard({
  data,
  loading,
}: AnalysisStatementCardProps) {
  const t = useTranslations("analysis")
  const monetary = useMonetaryFormattingSafe()
  const net = data?.summary.net ?? 0
  const operationalNet = data?.summary.operationalNet ?? 0

  return (
    <Card className="@container/card h-full bg-gradient-to-t from-primary/5 to-card shadow-xs dark:bg-card">
      <CardHeader>
        <CardTitle>{t("statement.title")}</CardTitle>
        <CardDescription>
          {t("statement.description")}
        </CardDescription>
        <CardAction>
          <Badge variant="outline" className="gap-1">
            <ReceiptText className="size-3.5" />
            {t("statement.badge")}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="rounded-lg border border-dashed bg-background/40 px-4 py-10 text-center text-sm text-muted-foreground">
            {t("statement.loading")}
          </div>
        ) : (
          <>
            <StatementSection
              title={t("statement.incomeTitle")}
              items={data?.incomeGroups ?? []}
              total={data?.summary.income ?? 0}
              tone="income"
            />

            <StatementSection
              title={t("statement.expenseTitle")}
              items={data?.expenseGroups ?? []}
              total={data?.summary.expense ?? 0}
              tone="expense"
            />

            <div className="flex items-center justify-between gap-4 rounded-xl border bg-background px-4 py-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold uppercase tracking-wide">
                  {t("statement.operationalResultTitle")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("statement.operationalResultDescription")}
                </p>
              </div>
              <p
                className={cn(
                  "text-lg font-semibold tabular-nums",
                  operationalNet < 0 ? "text-destructive" : "text-positive",
                )}
              >
                {monetary.formatMonetaryValue(operationalNet)}
              </p>
            </div>

            <TransferSection data={data} />

            <div className="flex items-center justify-between gap-4 rounded-xl border bg-background px-4 py-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold uppercase tracking-wide">
                  {t("statement.finalBalanceTitle")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("statement.finalBalanceDescription")}
                </p>
              </div>
              <p
                className={cn(
                  "text-xl font-semibold tabular-nums",
                  net < 0 ? "text-destructive" : "text-positive",
                )}
              >
                {monetary.formatMonetaryValue(net)}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
