"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  CalendarClock,
  CheckCircle,
  Copy,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react"

import { DetailPanel } from "@/components/detail-panel"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useDeviceClass } from "@/hooks/use-device-class"
import { cn } from "@/lib/utils"

interface TransactionBatchActionsProps<TData> {
  selectedData: TData[]
  selectedCount: number
  batchLoading?: boolean
  onQuickPaySelectedTransactions?: (items: TData[]) => Promise<boolean>
  onEditSelectedTransactionDate?: (items: TData[], date: string) => Promise<boolean>
  onEditSelectedTransactionPeriod?: (items: TData[], period: string) => Promise<boolean>
  onCopySelectedTransactions?: (items: TData[], date: string) => Promise<boolean>
  onMakeRecurringSelectedTransactions?: (items: TData[]) => Promise<boolean>
  onNotesSelectedTransactions?: (items: TData[]) => Promise<boolean>
  onDeleteSelectedTransactions?: (items: TData[]) => Promise<boolean>
  onClearSelection: () => void
}

export function TransactionBatchActions<TData>({
  selectedData,
  selectedCount,
  batchLoading,
  onQuickPaySelectedTransactions,
  onEditSelectedTransactionDate,
  onEditSelectedTransactionPeriod,
  onCopySelectedTransactions,
  onMakeRecurringSelectedTransactions,
  onNotesSelectedTransactions,
  onDeleteSelectedTransactions,
  onClearSelection,
}: TransactionBatchActionsProps<TData>) {
  const t = useTranslations("transactions.batch")
  const tCommon = useTranslations("common")
  const { isMobile } = useDeviceClass()
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [showQuickPayConfirm, setShowQuickPayConfirm] = React.useState(false)
  const [showMakeRecurringConfirm, setShowMakeRecurringConfirm] = React.useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false)
  const [showEditDateDialog, setShowEditDateDialog] = React.useState(false)
  const [showEditPeriodDialog, setShowEditPeriodDialog] = React.useState(false)
  const [showCopyDateDialog, setShowCopyDateDialog] = React.useState(false)
  const [selectedDate, setSelectedDate] = React.useState("")
  const [selectedPeriod, setSelectedPeriod] = React.useState("")
  const [selectedCopyDate, setSelectedCopyDate] = React.useState("")

  React.useEffect(() => {
    if (selectedDate) return
    setSelectedDate(new Date().toISOString().split("T")[0])
  }, [selectedDate])

  React.useEffect(() => {
    if (selectedCopyDate) return
    setSelectedCopyDate(new Date().toISOString().split("T")[0])
  }, [selectedCopyDate])

  const handleQuickPaySelected = async () => {
    if (!onQuickPaySelectedTransactions || selectedData.length === 0) return
    const ok = await onQuickPaySelectedTransactions(selectedData)
    if (ok) {
      onClearSelection()
      setShowQuickPayConfirm(false)
    }
  }

  const handleEditPeriodSelected = async () => {
    if (
      !onEditSelectedTransactionPeriod ||
      selectedData.length === 0 ||
      !/^\d{4}(0[1-9]|1[0-2])$/.test(selectedPeriod)
    ) {
      return
    }
    const ok = await onEditSelectedTransactionPeriod(selectedData, selectedPeriod)
    if (ok) {
      onClearSelection()
      setShowEditPeriodDialog(false)
    }
  }

  const handleEditDateSelected = async () => {
    if (
      !onEditSelectedTransactionDate ||
      selectedData.length === 0 ||
      !selectedDate
    ) {
      return
    }
    const ok = await onEditSelectedTransactionDate(selectedData, selectedDate)
    if (ok) {
      onClearSelection()
      setShowEditDateDialog(false)
    }
  }

  const handleCopyDateSelected = async () => {
    if (
      !onCopySelectedTransactions ||
      selectedData.length === 0 ||
      !selectedCopyDate
    ) {
      return
    }
    const ok = await onCopySelectedTransactions(selectedData, selectedCopyDate)
    if (ok) {
      onClearSelection()
      setShowCopyDateDialog(false)
    }
  }

  const handleMakeRecurringSelected = async () => {
    if (!onMakeRecurringSelectedTransactions || selectedData.length === 0) return
    const ok = await onMakeRecurringSelectedTransactions(selectedData)
    if (ok) {
      onClearSelection()
      setShowMakeRecurringConfirm(false)
    }
  }

  const handleNotesSelected = async () => {
    if (!onNotesSelectedTransactions || selectedData.length === 0) return
    const ok = await onNotesSelectedTransactions(selectedData)
    if (ok) {
      onClearSelection()
    }
  }

  const handleDeleteSelected = async () => {
    if (!onDeleteSelectedTransactions || selectedData.length === 0) return
    const ok = await onDeleteSelectedTransactions(selectedData)
    if (ok) {
      onClearSelection()
      setShowDeleteConfirm(false)
    }
  }

  if (selectedCount === 0) return null

  // As 7 ações viram dados: a faixa desktop, os atalhos do mobile e o drawer
  // renderizam todas a partir desta lista — sem duplicar JSX.
  const actions = [
    {
      key: "pay",
      icon: CheckCircle,
      iconClassName: "text-positive",
      label: t("pay"),
      tooltip: t("payTooltip"),
      onSelect: () => setShowQuickPayConfirm(true),
    },
    {
      key: "editDate",
      icon: Pencil,
      iconClassName: undefined,
      label: t("editDate"),
      tooltip: t("editDate"),
      onSelect: () => setShowEditDateDialog(true),
    },
    {
      key: "editPeriod",
      icon: CalendarClock,
      iconClassName: undefined,
      label: t("editPeriod"),
      tooltip: t("editPeriod"),
      onSelect: () => setShowEditPeriodDialog(true),
    },
    {
      key: "makeRecurring",
      icon: RotateCcw,
      iconClassName: "text-info",
      label: t("makeRecurring"),
      tooltip: t("makeRecurring"),
      onSelect: () => setShowMakeRecurringConfirm(true),
    },
    {
      key: "copy",
      icon: Copy,
      iconClassName: "text-info",
      label: t("copy"),
      tooltip: t("copyTooltip"),
      onSelect: () => setShowCopyDateDialog(true),
    },
    {
      key: "notes",
      icon: MessageSquare,
      iconClassName: "text-primary",
      label: t("notes"),
      tooltip: t("notesTooltip"),
      onSelect: () => void handleNotesSelected(),
    },
    {
      key: "delete",
      icon: Trash2,
      iconClassName: "text-destructive",
      label: t("delete"),
      tooltip: t("deleteTooltip"),
      onSelect: () => setShowDeleteConfirm(true),
    },
  ] as const

  // No mobile a faixa só comporta os dois atalhos mais usados; o resto vai pro drawer.
  const mobileShortcuts = actions.filter((a) => a.key === "pay" || a.key === "delete")

  return (
    <>
      <div className="bg-primary/5 border-primary/20 animate-in fade-in slide-in-from-top-1 flex items-center justify-between gap-2 rounded-lg border px-3 py-2 duration-200">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="text-primary shrink-0 text-sm font-semibold">
            {selectedCount}
          </span>

          {isMobile ? (
            <>
              {mobileShortcuts.map((action) => (
                <Button
                  key={action.key}
                  variant="ghost"
                  size="icon"
                  className="hover:bg-muted h-8 w-8 cursor-pointer"
                  disabled={batchLoading}
                  onClick={action.onSelect}
                >
                  <action.icon className={cn("h-4 w-4", action.iconClassName)} />
                  <span className="sr-only">{action.label}</span>
                </Button>
              ))}
              <Button
                variant="ghost"
                size="icon"
                className="hover:bg-muted h-8 w-8 cursor-pointer"
                disabled={batchLoading}
                onClick={() => setDrawerOpen(true)}
              >
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">{t("moreActions")}</span>
              </Button>
            </>
          ) : (
            actions.map((action) => (
              <Tooltip key={action.key}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="hover:bg-muted h-8 w-8 cursor-pointer"
                    disabled={batchLoading}
                    onClick={action.onSelect}
                  >
                    <action.icon className={cn("h-4 w-4", action.iconClassName)} />
                    <span className="sr-only">{action.label}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{action.tooltip}</TooltipContent>
              </Tooltip>
            ))
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground h-8 shrink-0 cursor-pointer px-2 text-[11px] sm:text-sm"
          onClick={onClearSelection}
        >
          <span className="hidden sm:inline">{t("cancel")}</span>
          <span className="sm:hidden">{t("clear")}</span>
        </Button>
      </div>

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} direction="bottom">
        <DrawerContent className="pb-safe flex max-h-[92dvh] flex-col">
          <DrawerHeader className="border-b px-5 pt-2 pb-3 text-left">
            <DrawerTitle className="flex items-center gap-2 text-base leading-tight font-semibold">
              {t("drawerTitle")}
              <span className="text-primary text-sm font-semibold">{selectedCount}</span>
            </DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto overscroll-contain p-2">
            {actions.map((action) => (
              <button
                key={action.key}
                type="button"
                className="hover:bg-muted flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-sm"
                disabled={batchLoading}
                onClick={() => {
                  setDrawerOpen(false)
                  action.onSelect()
                }}
              >
                <action.icon className={cn("size-5", action.iconClassName)} />
                {action.label}
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>

      <AlertDialog open={showQuickPayConfirm} onOpenChange={setShowQuickPayConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("quickPayTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("quickPayDescription", { count: selectedCount })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={batchLoading}>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={batchLoading}
              onClick={() => void handleQuickPaySelected()}
            >
              {batchLoading ? t("processing") : tCommon("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DetailPanel
        open={showEditDateDialog}
        onOpenChange={setShowEditDateDialog}
        title={t("editDateTitle")}
        description={t("editDateDescription", { count: selectedCount })}
        className="space-y-4"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setShowEditDateDialog(false)}
              disabled={batchLoading}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              onClick={() => void handleEditDateSelected()}
              disabled={batchLoading || !selectedDate}
            >
              {batchLoading ? t("saving") : t("saveDate")}
            </Button>
          </>
        }
      >
        <p className="text-muted-foreground text-sm">
          {t("editDateDescription", { count: selectedCount })}
        </p>
        <div className="space-y-2">
          <Label htmlFor="batch-transaction-date">{t("dateLabel")}</Label>
          <Input
            id="batch-transaction-date"
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
          />
        </div>
      </DetailPanel>

      <DetailPanel
        open={showEditPeriodDialog}
        onOpenChange={setShowEditPeriodDialog}
        title={t("editPeriodTitle")}
        description={t("editPeriodDescription", { count: selectedCount })}
        className="space-y-4"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setShowEditPeriodDialog(false)}
              disabled={batchLoading}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              onClick={() => void handleEditPeriodSelected()}
              disabled={
                batchLoading || !/^\d{4}(0[1-9]|1[0-2])$/.test(selectedPeriod)
              }
            >
              {batchLoading ? t("saving") : t("savePeriod")}
            </Button>
          </>
        }
      >
        <p className="text-muted-foreground text-sm">
          {t("editPeriodDescription", { count: selectedCount })}
        </p>
        <div className="space-y-2">
          <Label htmlFor="batch-transaction-period">{t("periodLabel")}</Label>
          <Input
            id="batch-transaction-period"
            value={selectedPeriod}
            onChange={(event) =>
              setSelectedPeriod(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            placeholder={t("periodPlaceholder")}
            maxLength={6}
            inputMode="numeric"
            className="tabular-nums"
          />
        </div>
      </DetailPanel>

      <DetailPanel
        open={showCopyDateDialog}
        onOpenChange={setShowCopyDateDialog}
        title={t("copyTitle")}
        description={t("copyDescription", { count: selectedCount })}
        className="space-y-4"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setShowCopyDateDialog(false)}
              disabled={batchLoading}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              onClick={() => void handleCopyDateSelected()}
              disabled={batchLoading || !selectedCopyDate}
            >
              {batchLoading ? t("copying") : t("copy")}
            </Button>
          </>
        }
      >
        <p className="text-muted-foreground text-sm">
          {t("copyDescription", { count: selectedCount })}
        </p>
        <div className="space-y-2">
          <Label htmlFor="batch-copy-transaction-date">{t("newDateLabel")}</Label>
          <Input
            id="batch-copy-transaction-date"
            type="date"
            value={selectedCopyDate}
            onChange={(event) => setSelectedCopyDate(event.target.value)}
          />
        </div>
      </DetailPanel>

      <AlertDialog open={showMakeRecurringConfirm} onOpenChange={setShowMakeRecurringConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("makeRecurringTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("makeRecurringDescription", { count: selectedCount })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={batchLoading}>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={batchLoading}
              onClick={() => void handleMakeRecurringSelected()}
            >
              {batchLoading ? t("creating") : tCommon("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDescription", { count: selectedCount })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={batchLoading}>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={batchLoading}
              onClick={() => void handleDeleteSelected()}
            >
              {batchLoading ? t("deleting") : tCommon("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
