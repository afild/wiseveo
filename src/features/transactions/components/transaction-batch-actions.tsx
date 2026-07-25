"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  CalendarClock,
  CheckCircle,
  Copy,
  MessageSquare,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

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

  return (
    <>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-primary text-sm font-semibold mr-1 shrink-0">
          {selectedCount}
        </span>
        <div className="bg-primary/5 border-primary/20 flex items-center gap-0.5 rounded-md border p-0.5 min-w-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 sm:h-8 sm:w-8 cursor-pointer hover:bg-muted"
                disabled={batchLoading}
                onClick={() => setShowQuickPayConfirm(true)}
              >
                <CheckCircle className="h-4 w-4 text-positive" />
                <span className="sr-only">{t("pay")}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("payTooltip")}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 sm:h-8 sm:w-8 cursor-pointer hover:bg-muted"
                disabled={batchLoading}
                onClick={() => setShowEditDateDialog(true)}
              >
                <Pencil className="h-4 w-4" />
                <span className="sr-only">{t("editDate")}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("editDate")}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 sm:h-8 sm:w-8 cursor-pointer hover:bg-muted"
                disabled={batchLoading}
                onClick={() => setShowEditPeriodDialog(true)}
              >
                <CalendarClock className="h-4 w-4" />
                <span className="sr-only">{t("editPeriod")}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("editPeriod")}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 sm:h-8 sm:w-8 cursor-pointer hover:bg-muted"
                disabled={batchLoading}
                onClick={() => setShowMakeRecurringConfirm(true)}
              >
                <RotateCcw className="h-4 w-4 text-info" />
                <span className="sr-only">{t("makeRecurring")}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("makeRecurring")}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 sm:h-8 sm:w-8 cursor-pointer hover:bg-muted"
                disabled={batchLoading}
                onClick={() => setShowCopyDateDialog(true)}
              >
                <Copy className="h-4 w-4 text-info" />
                <span className="sr-only">{t("copy")}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("copyTooltip")}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 sm:h-8 sm:w-8 cursor-pointer hover:bg-muted"
                disabled={batchLoading}
                onClick={() => void handleNotesSelected()}
              >
                <MessageSquare className="h-4 w-4 text-primary" />
                <span className="sr-only">{t("notes")}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("notesTooltip")}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 sm:h-8 sm:w-8 cursor-pointer hover:bg-muted"
                disabled={batchLoading}
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
                <span className="sr-only">{t("delete")}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("deleteTooltip")}</TooltipContent>
          </Tooltip>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground cursor-pointer h-8 px-2 text-[11px] sm:text-sm shrink-0"
          onClick={onClearSelection}
        >
          <span className="hidden sm:inline">{t("cancel")}</span>
          <span className="sm:hidden">{t("clear")}</span>
        </Button>
      </div>

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

      <Dialog open={showEditDateDialog} onOpenChange={setShowEditDateDialog}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{t("editDateTitle")}</DialogTitle>
            <DialogDescription>
              {t("editDateDescription", { count: selectedCount })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="batch-transaction-date">{t("dateLabel")}</Label>
            <Input
              id="batch-transaction-date"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </div>
          <DialogFooter>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditPeriodDialog} onOpenChange={setShowEditPeriodDialog}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{t("editPeriodTitle")}</DialogTitle>
            <DialogDescription>
              {t("editPeriodDescription", { count: selectedCount })}
            </DialogDescription>
          </DialogHeader>
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
          <DialogFooter>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCopyDateDialog} onOpenChange={setShowCopyDateDialog}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{t("copyTitle")}</DialogTitle>
            <DialogDescription>
              {t("copyDescription", { count: selectedCount })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="batch-copy-transaction-date">{t("newDateLabel")}</Label>
            <Input
              id="batch-copy-transaction-date"
              type="date"
              value={selectedCopyDate}
              onChange={(event) => setSelectedCopyDate(event.target.value)}
            />
          </div>
          <DialogFooter>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
