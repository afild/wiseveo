"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Paperclip, Upload, FileText, ImageIcon, Eye, Download, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
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
import { DetailPanel } from "@/components/detail-panel"
import { useMonetaryFormattingSafe } from "@/hooks/use-monetary-formatting"
import { cn } from "@/lib/utils"
import type { SerializedTransaction } from "../types"

interface Attachment {
  id: string
  fileName: string
  mimeType: string
  fileSize: number
  createdAt: string
}

interface AttachmentDialogProps {
  transaction: SerializedTransaction | null
  onClose: () => void
}

const MAX_FILE_SIZE = 3 * 1024 * 1024
const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
]

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isPreviewableMime(mimeType: string) {
  return mimeType.startsWith("image/") || mimeType === "application/pdf"
}

export function AttachmentDialog({
  transaction,
  onClose,
}: AttachmentDialogProps) {
  const monetary = useMonetaryFormattingSafe()
  const t = useTranslations("transactions.dialogs.attachments")
  const tDialogs = useTranslations("transactions.dialogs")
  const tCommon = useTranslations("common")
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [isDragActive, setIsDragActive] = useState(false)
  const [attachmentToDelete, setAttachmentToDelete] = useState<Attachment | null>(null)
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null)
  const [deleting, setDeleting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchAttachments = useCallback(async () => {
    if (!transaction) return
    setLoading(true)
    try {
      const res = await fetch(`/api/transactions/${transaction.id}/attachments`)
      if (res.ok) {
        const data = await res.json()
        setAttachments(data.attachments ?? [])
      }
    } catch {
      toast.error(t("loadError"))
    } finally {
      setLoading(false)
    }
  }, [transaction, t])

  useEffect(() => {
    if (transaction) {
      fetchAttachments()
    } else {
      setAttachments([])
    }
  }, [transaction, fetchAttachments])

  const handleUpload = async (files: FileList | File[]) => {
    if (!transaction) return

    const validFiles: File[] = []
    for (const file of Array.from(files)) {
      if (!ALLOWED_MIME.includes(file.type)) {
        toast.error(t("fileTypeNotAllowed", { fileName: file.name }))
        continue
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(t("fileTooLarge", { fileName: file.name }))
        continue
      }
      validFiles.push(file)
    }

    if (validFiles.length === 0) return

    setUploading(true)
    try {
      const formData = new FormData()
      validFiles.forEach((f) => formData.append("files", f))

      const res = await fetch(
        `/api/transactions/${transaction.id}/attachments`,
        { method: "POST", body: formData }
      )

      if (res.ok) {
        const data = await res.json()
        if (data.errors?.length) {
          toast.warning(t("someFilesFailed", { errors: data.errors.join(", ") }))
        } else {
          toast.success(t("uploadSuccess", { count: validFiles.length }))
        }
        fetchAttachments()
      } else {
        toast.error(t("uploadError"))
      }
    } catch {
      toast.error(t("uploadError"))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleOpenAttachment = (attachment: Attachment) => {
    if (!transaction) return

    if (!isPreviewableMime(attachment.mimeType)) {
      toast.error(t("previewUnavailable"))
      return
    }

    setPreviewAttachment(attachment)
  }

  const handleDownloadAttachment = (attachment: Attachment) => {
    if (!transaction) return

    try {
      const url = `/api/transactions/${transaction.id}/attachments/${attachment.id}?download=1`
      const link = document.createElement("a")
      link.href = url
      link.download = attachment.fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      toast.success(t("downloadStarted"))
    } catch {
      toast.error(t("downloadError"))
    }
  }

  const previewUrl =
    transaction && previewAttachment
      ? `/api/transactions/${transaction.id}/attachments/${previewAttachment.id}`
      : null

  const handleConfirmDeleteAttachment = async () => {
    if (!transaction || !attachmentToDelete) return
    setDeleting(true)
    try {
      const res = await fetch(
        `/api/transactions/${transaction.id}/attachments/${attachmentToDelete.id}`,
        { method: "DELETE" }
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || t("deleteError"))
        return
      }
      toast.success(t("deleteSuccess"))
      setAttachments((prev) => prev.filter((item) => item.id !== attachmentToDelete.id))
      setAttachmentToDelete(null)
    } catch {
      toast.error(t("deleteError"))
    } finally {
      setDeleting(false)
    }
  }

  const panelDescription = `${transaction?.note || tDialogs("transactionFallback")} — ${
    transaction ? monetary.formatMonetaryValue(transaction.amount) : ""
  }`

  return (
    <>
      <DetailPanel
        open={!!transaction}
        onOpenChange={(open) => !open && onClose()}
        title={
          <span className="flex items-center gap-2">
            <Paperclip className="h-4 w-4" />
            {t("title")}
          </span>
        }
        description={panelDescription}
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {transaction?.note || tDialogs("transactionFallback")} —{" "}
            {transaction ? monetary.formatMonetaryValue(transaction.amount) : ""}
          </p>

          {loading ? (
            <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>
          ) : attachments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("noAttachments")}
            </p>
          ) : (
            <ul className="space-y-2">
              {attachments.map((att) => (
                <li
                  key={att.id}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 rounded-md border p-2 text-sm"
                >
                  {att.mimeType.startsWith("image/") ? (
                    <ImageIcon className="h-4 w-4 shrink-0 text-warning" />
                  ) : (
                    <FileText className="h-4 w-4 shrink-0 text-info" />
                  )}
                  <span className="min-w-0 truncate">{att.fileName}</span>
                  <span className="w-14 text-right text-xs text-muted-foreground">
                    {formatFileSize(att.fileSize)}
                  </span>
                  <div className="flex w-[84px] items-center justify-end gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => handleOpenAttachment(att)}
                      title={isPreviewableMime(att.mimeType) ? t("previewAction") : t("openAction")}
                    >
                      <Eye className="h-4 w-4" />
                      <span className="sr-only">{t("previewAction")}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => handleDownloadAttachment(att)}
                      title={t("downloadAction")}
                    >
                      <Download className="h-4 w-4" />
                      <span className="sr-only">{t("downloadAction")}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                      disabled={deleting}
                      onClick={() => setAttachmentToDelete(att)}
                      title={t("deleteAction")}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">{t("deleteAction")}</span>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="pt-2">
            <div
              className={cn(
                "rounded-lg border-2 border-dashed p-4 text-center transition-colors",
                isDragActive
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-muted/40",
                uploading && "pointer-events-none opacity-70"
              )}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(e) => {
                e.preventDefault()
                setIsDragActive(true)
              }}
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragActive(true)
              }}
              onDragLeave={(e) => {
                e.preventDefault()
                setIsDragActive(false)
              }}
              onDrop={(e) => {
                e.preventDefault()
                setIsDragActive(false)
                if (e.dataTransfer.files?.length) {
                  void handleUpload(e.dataTransfer.files)
                }
              }}
            >
              <Upload className="mx-auto h-5 w-5 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">
                {t("dropHintTitle")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("dropHintSubtitle")}
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleUpload(e.target.files)
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="mt-2 w-full"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              {uploading ? t("uploading") : t("addButton")}
            </Button>
          </div>
        </div>
      </DetailPanel>

      <Dialog
        open={!!previewAttachment}
        onOpenChange={(open) => !open && setPreviewAttachment(null)}
      >
        <DialogContent className="inset-0 left-0 top-0 h-[100dvh] w-[100dvw] max-h-none max-w-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 p-0 sm:max-w-none">
          <DialogHeader className="shrink-0 border-b px-4 py-3">
            <DialogTitle className="truncate">
              {previewAttachment?.fileName ?? t("previewFallbackTitle")}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {previewAttachment
                ? `${formatFileSize(previewAttachment.fileSize)} • ${previewAttachment.mimeType}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 bg-black">
            {previewAttachment && previewUrl ? (
              previewAttachment.mimeType.startsWith("image/") ? (
                <div className="flex h-full w-full items-center justify-center overflow-auto bg-black">
                  <img
                    src={previewUrl}
                    alt={previewAttachment.fileName}
                    className="h-auto w-auto max-h-full max-w-full object-contain"
                  />
                </div>
              ) : previewAttachment.mimeType === "application/pdf" ? (
                <iframe
                  title={previewAttachment.fileName}
                  src={previewUrl}
                  className="h-full w-full border-0 bg-background"
                />
              ) : (
                <div className="flex h-full items-center justify-center rounded-md border bg-background p-4 text-center text-sm text-muted-foreground">
                  {t("noPreviewAvailable")}
                </div>
              )
            ) : null}
          </div>

          <DialogFooter className="shrink-0 border-t px-4 py-3 sm:justify-between">
            <div className="text-xs text-muted-foreground">
              {t("previewLabel")}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => previewAttachment && handleDownloadAttachment(previewAttachment)}
            >
              <Download className="mr-2 h-4 w-4" />
              {t("downloadButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!attachmentToDelete}
        onOpenChange={(open) => !open && setAttachmentToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteConfirmText")}
              {attachmentToDelete && (
                <span className="mt-2 block text-foreground">
                  {attachmentToDelete.fileName}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={() => void handleConfirmDeleteAttachment()}
            >
              {deleting ? t("deleting") : tCommon("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
