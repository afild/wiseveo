"use client"

import {
  Activity,
  Anchor,
  CalendarClock,
  CalendarRange,
  CalendarX,
  Gauge,
  Hourglass,
  PiggyBank,
  Repeat,
  ScanSearch,
  Umbrella,
  Wallet,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { Badge } from "@/components/ui/badge"
import { formatAppDate } from "@/i18n/format"
import { formatPercentValue } from "@/lib/monetary"
import { useMonetaryFormattingSafe } from "@/hooks/use-monetary-formatting"
import { cn } from "@/lib/utils"
import { KpiCard } from "./kpi-card"
import { KpiSparkline } from "./kpi-sparkline"
import type {
  BudgetPacingKpi,
  BurnRateKpi,
  CashProjectionKpi,
  EmergencyRunwayKpi,
  FixedCommitmentKpi,
  KpiZone,
  MonthEndForecastKpi,
  OverdueCostKpi,
  PersonalRunwayKpi,
  RecurringLoadKpi,
  SafeToSpendKpi,
  SavingsRateKpi,
  SpendingAnomalyKpi,
} from "../types"

const PROGRESS_FILL: Record<Exclude<KpiZone, "neutral">, string> = {
  good: "bg-positive",
  warning: "bg-warning",
  critical: "bg-destructive",
}

function ProgressBar({
  pct,
  zone,
  markerPct,
}: {
  pct: number
  zone: KpiZone
  markerPct?: number
}) {
  const fill = zone === "neutral" ? "bg-muted-foreground" : PROGRESS_FILL[zone]
  return (
    <div className="relative h-2 w-full rounded-full bg-muted/60">
      <div
        className={cn("h-full rounded-full transition-[width] duration-700", fill)}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
      {markerPct !== undefined && (
        <div
          className="absolute top-[-3px] h-[14px] w-px bg-foreground/40"
          style={{ left: `${Math.min(100, Math.max(0, markerPct))}%` }}
        />
      )}
    </div>
  )
}

export function SafeToSpendCard({ kpi }: { kpi: SafeToSpendKpi }) {
  const t = useTranslations("insights")
  const monetary = useMonetaryFormattingSafe()

  return (
    <KpiCard
      icon={Wallet}
      label={t("kpis.safeToSpend.label")}
      how={t("kpis.safeToSpend.how")}
      value={monetary.formatMonetaryValue(kpi.available)}
      zone={kpi.zone}
      zoneLabel={kpi.zone === "neutral" ? undefined : t(`zones.${kpi.zone}`)}
      footerTitle={t("kpis.safeToSpend.committed", {
        value: monetary.formatMonetaryValue(kpi.committed30d),
      })}
      footerDetail={
        kpi.available > 0
          ? t("kpis.safeToSpend.perDay", {
              value: monetary.formatMonetaryValue(kpi.perDay),
            })
          : t("kpis.safeToSpend.negative")
      }
    />
  )
}

export function EmergencyRunwayCard({ kpi }: { kpi: EmergencyRunwayKpi }) {
  const t = useTranslations("insights")
  const monetary = useMonetaryFormattingSafe()

  if (kpi.state === "insufficient") {
    return (
      <KpiCard
        icon={Umbrella}
        label={t("kpis.emergencyRunway.label")}
        how={t("kpis.emergencyRunway.how")}
        value="—"
        muted
        zone="neutral"
        footerTitle={t("states.insufficient")}
        footerDetail={t("states.insufficientDetail", { months: 3 })}
      />
    )
  }

  return (
    <KpiCard
      icon={Umbrella}
      label={t("kpis.emergencyRunway.label")}
      how={t("kpis.emergencyRunway.how")}
      value={
        <>
          {kpi.coverageMonths.toFixed(1)}{" "}
          <span className="text-sm font-normal text-muted-foreground">
            {t("kpis.emergencyRunway.monthsUnit")}
          </span>
        </>
      }
      zone={kpi.zone}
      zoneLabel={kpi.zone === "neutral" ? undefined : t(`zones.${kpi.zone}`)}
      footerTitle={t("kpis.emergencyRunway.target", {
        value: kpi.targetMonths.toFixed(1),
        cv: formatPercentValue(kpi.incomeCvPct, 0),
      })}
      footerDetail={t("kpis.emergencyRunway.avgExpense", {
        value: monetary.formatMonetaryValue(kpi.avgMonthlyExpense),
      })}
    >
      <ProgressBar
        pct={(kpi.coverageMonths / kpi.targetMonths) * 100}
        zone={kpi.zone}
      />
    </KpiCard>
  )
}

export function BudgetPacingCard({ kpi }: { kpi: BudgetPacingKpi }) {
  const t = useTranslations("insights")

  if (kpi.state === "empty") {
    return (
      <KpiCard
        icon={Gauge}
        label={t("kpis.budgetPacing.label")}
        how={t("kpis.budgetPacing.how")}
        value="—"
        muted
        zone="neutral"
        footerTitle={t("kpis.budgetPacing.empty")}
        footerDetail={t("kpis.budgetPacing.emptyCta")}
      />
    )
  }

  const footerTitle =
    kpi.projectedOverrunDay !== null
      ? t("kpis.budgetPacing.overrun", { day: kpi.projectedOverrunDay })
      : t("kpis.budgetPacing.onTrack")

  const footerDetail =
    kpi.worstItemName !== null && kpi.worstItemPct !== null
      ? t("kpis.budgetPacing.detailWithWorst", {
          monthPct: formatPercentValue(kpi.monthPct, 0),
          name: kpi.worstItemName,
          pct: formatPercentValue(kpi.worstItemPct, 0),
        })
      : t("kpis.budgetPacing.detail", {
          monthPct: formatPercentValue(kpi.monthPct, 0),
        })

  return (
    <KpiCard
      icon={Gauge}
      label={t("kpis.budgetPacing.label")}
      how={t("kpis.budgetPacing.how")}
      value={formatPercentValue(kpi.usagePct, 0)}
      zone={kpi.zone}
      zoneLabel={kpi.zone === "neutral" ? undefined : t(`zones.${kpi.zone}`)}
      footerTitle={footerTitle}
      footerDetail={footerDetail}
    >
      <ProgressBar pct={kpi.usagePct} zone={kpi.zone} markerPct={kpi.monthPct} />
    </KpiCard>
  )
}

export function SavingsRateCard({ kpi }: { kpi: SavingsRateKpi }) {
  const t = useTranslations("insights")

  if (kpi.state === "insufficient") {
    return (
      <KpiCard
        icon={PiggyBank}
        label={t("kpis.savingsRate.label")}
        how={t("kpis.savingsRate.how")}
        value="—"
        muted
        zone="neutral"
        footerTitle={t("states.insufficient")}
        footerDetail={t("states.insufficientDetail", { months: 3 })}
      />
    )
  }

  return (
    <KpiCard
      icon={PiggyBank}
      label={t("kpis.savingsRate.label")}
      how={t("kpis.savingsRate.how")}
      value={
        kpi.currentMonthRatePct !== null
          ? formatPercentValue(kpi.currentMonthRatePct, 1, true)
          : "—"
      }
      zone={kpi.zone}
      zoneLabel={kpi.zone === "neutral" ? undefined : t(`zones.${kpi.zone}`)}
      footerTitle={
        kpi.avg12mRatePct !== null
          ? t("kpis.savingsRate.avg", {
              value: formatPercentValue(kpi.avg12mRatePct, 1, true),
            })
          : t("kpis.savingsRate.explainer")
      }
      footerDetail={
        kpi.avg12mRatePct !== null ? t("kpis.savingsRate.explainer") : undefined
      }
    >
      <KpiSparkline points={kpi.series.map((p) => p.rate)} />
    </KpiCard>
  )
}

export function FixedCommitmentCard({ kpi }: { kpi: FixedCommitmentKpi }) {
  const t = useTranslations("insights")
  const monetary = useMonetaryFormattingSafe()

  if (kpi.state === "empty") {
    return (
      <KpiCard
        icon={Anchor}
        label={t("kpis.fixedCommitment.label")}
        how={t("kpis.fixedCommitment.how")}
        value="—"
        muted
        zone="neutral"
        footerTitle={t("kpis.fixedCommitment.empty")}
        footerDetail={t("kpis.fixedCommitment.emptyCta")}
      />
    )
  }

  return (
    <KpiCard
      icon={Anchor}
      label={t("kpis.fixedCommitment.label")}
      how={t("kpis.fixedCommitment.how")}
      value={kpi.ratioPct !== null ? formatPercentValue(kpi.ratioPct, 0) : "—"}
      muted={kpi.ratioPct === null}
      zone={kpi.zone}
      zoneLabel={kpi.zone === "neutral" ? undefined : t(`zones.${kpi.zone}`)}
      footerTitle={t("kpis.fixedCommitment.fixedOfIncome", {
        value: monetary.formatMonetaryValue(kpi.fixedMonthly),
      })}
      footerDetail={t("kpis.fixedCommitment.reference")}
    />
  )
}

export function RecurringLoadCard({ kpi }: { kpi: RecurringLoadKpi }) {
  const t = useTranslations("insights")
  const monetary = useMonetaryFormattingSafe()

  if (kpi.state === "empty") {
    return (
      <KpiCard
        icon={Repeat}
        label={t("kpis.recurringLoad.label")}
        how={t("kpis.recurringLoad.how")}
        value="—"
        muted
        zone="neutral"
        footerTitle={t("kpis.recurringLoad.empty")}
        footerDetail={t("kpis.recurringLoad.emptyCta")}
      />
    )
  }

  return (
    <KpiCard
      icon={Repeat}
      label={t("kpis.recurringLoad.label")}
      how={t("kpis.recurringLoad.how")}
      value={
        <>
          {monetary.formatMonetaryValue(kpi.monthlyTotal)}
          <span className="text-sm font-normal text-muted-foreground">
            {t("kpis.recurringLoad.perMonth")}
          </span>
        </>
      }
      zone="neutral"
      badge={
        <Badge variant="outline">
          {t("kpis.recurringLoad.count", { count: kpi.count })}
        </Badge>
      }
      footerTitle={t("kpis.recurringLoad.annual", {
        value: monetary.formatMonetaryValue(kpi.annualTotal),
      })}
      footerDetail={
        kpi.incomeSharePct !== null
          ? t("kpis.recurringLoad.share", {
              value: formatPercentValue(kpi.incomeSharePct, 0),
            })
          : undefined
      }
    />
  )
}

export function OverdueCostCard({ kpi }: { kpi: OverdueCostKpi }) {
  const t = useTranslations("insights")
  const monetary = useMonetaryFormattingSafe()

  if (kpi.count === 0) {
    return (
      <KpiCard
        icon={CalendarX}
        label={t("kpis.overdueCost.label")}
        how={t("kpis.overdueCost.how")}
        value="0"
        zone="good"
        zoneLabel={t("zones.good")}
        footerTitle={t("kpis.overdueCost.allClear")}
        footerDetail={t("kpis.overdueCost.allClearDetail")}
      />
    )
  }

  return (
    <KpiCard
      icon={CalendarX}
      label={t("kpis.overdueCost.label")}
      how={t("kpis.overdueCost.how")}
      value={String(kpi.count)}
      zone={kpi.zone}
      zoneLabel={kpi.zone === "neutral" ? undefined : t(`zones.${kpi.zone}`)}
      footerTitle={t("kpis.overdueCost.openTotal", {
        cost: monetary.formatMonetaryValue(kpi.estimatedCost),
        total: monetary.formatMonetaryValue(kpi.totalAmount),
      })}
      footerDetail={t("kpis.overdueCost.oldest", { days: kpi.oldestDays })}
    />
  )
}

export function BurnRateCard({ kpi }: { kpi: BurnRateKpi }) {
  const t = useTranslations("insights")
  const monetary = useMonetaryFormattingSafe()

  if (kpi.state === "insufficient") {
    return (
      <KpiCard
        icon={Activity}
        label={t("kpis.burnRate.label")}
        how={t("kpis.burnRate.how")}
        value="—"
        muted
        zone="neutral"
        footerTitle={t("states.insufficient")}
        footerDetail={t("states.insufficientDetail", { months: 4 })}
      />
    )
  }

  return (
    <KpiCard
      icon={Activity}
      label={t("kpis.burnRate.label")}
      how={t("kpis.burnRate.how")}
      value={
        <>
          {monetary.formatMonetaryValue(kpi.recentMonthly)}
          <span className="text-sm font-normal text-muted-foreground">
            {t("kpis.burnRate.perMonth")}
          </span>
        </>
      }
      zone={kpi.zone}
      zoneLabel={kpi.zone === "neutral" ? undefined : t(`zones.${kpi.zone}`)}
      footerTitle={t("kpis.burnRate.delta", {
        value: formatPercentValue(kpi.deltaPct, 0, true),
      })}
      footerDetail={t("kpis.burnRate.baseline", {
        value: monetary.formatMonetaryValue(kpi.baselineMonthly),
      })}
    >
      <KpiSparkline points={kpi.series} />
    </KpiCard>
  )
}

export function SpendingAnomalyCard({ kpi }: { kpi: SpendingAnomalyKpi }) {
  const t = useTranslations("insights")
  const monetary = useMonetaryFormattingSafe()

  if (kpi.state === "insufficient") {
    return (
      <KpiCard
        icon={ScanSearch}
        label={t("kpis.spendingAnomaly.label")}
        how={t("kpis.spendingAnomaly.how")}
        value="—"
        muted
        zone="neutral"
        footerTitle={t("states.insufficient")}
        footerDetail={t("states.insufficientDetail", { months: 6 })}
      />
    )
  }

  if (kpi.count === 0) {
    return (
      <KpiCard
        icon={ScanSearch}
        label={t("kpis.spendingAnomaly.label")}
        how={t("kpis.spendingAnomaly.how")}
        value={t("kpis.spendingAnomaly.unit", { count: 0 })}
        zone="good"
        zoneLabel={t("zones.good")}
        footerTitle={t("kpis.spendingAnomaly.allClear")}
        footerDetail={t("kpis.spendingAnomaly.allClearDetail")}
      />
    )
  }

  const worst = kpi.anomalies[0]

  return (
    <KpiCard
      icon={ScanSearch}
      label={t("kpis.spendingAnomaly.label")}
      how={t("kpis.spendingAnomaly.how")}
      value={t("kpis.spendingAnomaly.unit", { count: kpi.count })}
      zone={kpi.zone}
      zoneLabel={kpi.zone === "neutral" ? undefined : t(`zones.${kpi.zone}`)}
      footerTitle={t("kpis.spendingAnomaly.worst", {
        amount: monetary.formatMonetaryValue(worst.amount),
        median: monetary.formatMonetaryValue(worst.medianAmount),
        name: worst.name,
      })}
      footerDetail={
        kpi.count > 1
          ? t("kpis.spendingAnomaly.more", { count: kpi.count - 1 })
          : t("kpis.spendingAnomaly.method")
      }
    />
  )
}

export function MonthEndForecastCard({ kpi }: { kpi: MonthEndForecastKpi }) {
  const t = useTranslations("insights")
  const monetary = useMonetaryFormattingSafe()

  if (kpi.state === "insufficient") {
    return (
      <KpiCard
        icon={CalendarRange}
        label={t("kpis.monthEndForecast.label")}
        how={t("kpis.monthEndForecast.how")}
        value="—"
        muted
        zone="neutral"
        footerTitle={t("states.insufficient")}
        footerDetail={t("states.insufficientDetail", { months: 3 })}
      />
    )
  }

  return (
    <KpiCard
      icon={CalendarRange}
      label={t("kpis.monthEndForecast.label")}
      how={t("kpis.monthEndForecast.how")}
      value={monetary.formatMonetaryValue(kpi.projectedOutflow)}
      zone={kpi.zone}
      zoneLabel={kpi.zone === "neutral" ? undefined : t(`zones.${kpi.zone}`)}
      footerTitle={t("kpis.monthEndForecast.band", {
        p25: monetary.formatMonetaryValue(kpi.p25),
        p75: monetary.formatMonetaryValue(kpi.p75),
      })}
      footerDetail={t("kpis.monthEndForecast.breakdown", {
        booked: monetary.formatMonetaryValue(kpi.bookedMonth),
        diffuse: monetary.formatMonetaryValue(kpi.diffuseRemainder),
      })}
    />
  )
}

export function PersonalRunwayCard({ kpi }: { kpi: PersonalRunwayKpi }) {
  const t = useTranslations("insights")
  const monetary = useMonetaryFormattingSafe()

  if (kpi.state === "insufficient") {
    return (
      <KpiCard
        icon={Hourglass}
        label={t("kpis.personalRunway.label")}
        how={t("kpis.personalRunway.how")}
        value="—"
        muted
        zone="neutral"
        footerTitle={t("states.insufficient")}
        footerDetail={t("states.insufficientDetail", { months: 3 })}
      />
    )
  }

  if (kpi.runwayMonths === null) {
    return (
      <KpiCard
        icon={Hourglass}
        label={t("kpis.personalRunway.label")}
        how={t("kpis.personalRunway.how")}
        value={
          <>
            {`+${monetary.formatMonetaryValue(kpi.netMonthly)}`}
            <span className="text-sm font-normal text-muted-foreground">
              {t("kpis.personalRunway.perMonth")}
            </span>
          </>
        }
        zone="good"
        zoneLabel={t("zones.good")}
        footerTitle={t("kpis.personalRunway.growing")}
        footerDetail={t("kpis.personalRunway.basis")}
      />
    )
  }

  return (
    <KpiCard
      icon={Hourglass}
      label={t("kpis.personalRunway.label")}
      how={t("kpis.personalRunway.how")}
      value={
        <>
          {kpi.runwayMonths.toFixed(1)}{" "}
          <span className="text-sm font-normal text-muted-foreground">
            {t("kpis.personalRunway.monthsUnit")}
          </span>
        </>
      }
      zone={kpi.zone}
      zoneLabel={kpi.zone === "neutral" ? undefined : t(`zones.${kpi.zone}`)}
      footerTitle={t("kpis.personalRunway.burning", {
        value: monetary.formatMonetaryValue(Math.abs(kpi.netMonthly)),
      })}
      footerDetail={t("kpis.personalRunway.basis")}
    />
  )
}

export function CashProjectionCard({ kpi }: { kpi: CashProjectionKpi }) {
  const t = useTranslations("insights")
  const locale = useLocale()

  if (kpi.state === "insufficient") {
    return (
      <KpiCard
        icon={CalendarClock}
        label={t("kpis.cashProjection.label")}
        how={t("kpis.cashProjection.how")}
        value="—"
        muted
        zone="neutral"
        footerTitle={t("states.insufficient")}
        footerDetail={t("kpis.cashProjection.noAccounts")}
      />
    )
  }

  const daysUnit = (
    <span className="text-sm font-normal text-muted-foreground">
      {t("kpis.cashProjection.daysUnit")}
    </span>
  )

  if (kpi.daysToNegative === null) {
    return (
      <KpiCard
        icon={CalendarClock}
        label={t("kpis.cashProjection.label")}
        how={t("kpis.cashProjection.how")}
        value={<>{`${kpi.horizonDays}+`} {daysUnit}</>}
        zone="good"
        zoneLabel={t("zones.good")}
        footerTitle={t("kpis.cashProjection.noEvent", { days: kpi.horizonDays })}
        footerDetail={t("kpis.cashProjection.method")}
      />
    )
  }

  return (
    <KpiCard
      icon={CalendarClock}
      label={t("kpis.cashProjection.label")}
      how={t("kpis.cashProjection.how")}
      value={<>{kpi.daysToNegative} {daysUnit}</>}
      zone={kpi.zone}
      zoneLabel={kpi.zone === "neutral" ? undefined : t(`zones.${kpi.zone}`)}
      footerTitle={t("kpis.cashProjection.event", {
        account: kpi.accountName ?? "",
        date: kpi.projectedDate
          ? formatAppDate(new Date(kpi.projectedDate), "PP", locale)
          : "",
      })}
      footerDetail={t("kpis.cashProjection.method")}
    />
  )
}
