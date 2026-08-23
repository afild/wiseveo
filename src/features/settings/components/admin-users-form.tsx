"use client"

import * as React from "react"
import { toast } from "sonner"
import { CheckCircle2, Database, ShieldCheck, Trash2, UserCheck, UserPlus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { AdminUserSummary } from "../services/admin-users-service"
import type { SharedAccountStructure } from "../lib/shared-account-structure"
import { canChangeRole, canRemoveUser, USER_ROLES, type UserRole } from "@/lib/user-roles"
import { useLocale, useTranslations } from "next-intl"
import { createDateFormatter } from "@/i18n/format"

interface AdminContext {
  currentUserId: string
  currentUserRole: UserRole
  /** Estrutura dos convites no banco; null = não dá para saber (demo ou falha de leitura). */
  sharedAccount: SharedAccountStructure | null
}

interface AdminUsersFormProps {
  initialUsers: AdminUserSummary[]
  context?: AdminContext
}

function statusBadge(status: AdminUserSummary["status"], t: ReturnType<typeof useTranslations>) {
  if (status === "ACTIVE") {
    return (
      <Badge variant="secondary" className="bg-positive/10 text-positive">
        {t("active")}
      </Badge>
    )
  }

  return (
    <Badge variant="secondary" className="bg-warning/10 text-warning">
      {t("pending")}
    </Badge>
  )
}

function roleBadge(role: AdminUserSummary["role"], t: ReturnType<typeof useTranslations>) {
  if (role === "ADMIN" || role === "SUPERADMIN") {
    return (
      <Badge variant="outline" className="gap-1">
        <ShieldCheck className="size-3" />
        {t(`roles.${role}`)}
      </Badge>
    )
  }
  return <Badge variant="outline">{t("roles.USER")}</Badge>
}

function formatDate(value: string, locale: string) {
  return createDateFormatter(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value))
}

export function AdminUsersForm({ initialUsers, context }: AdminUsersFormProps) {
  const t = useTranslations("settings.adminUsers")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const [users, setUsers] = React.useState(initialUsers)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = React.useState<AdminUserSummary | null>(null)
  const [sharedAccount, setSharedAccount] = React.useState(context?.sharedAccount ?? null)
  const [preparing, setPreparing] = React.useState(false)
  const [confirmPrepare, setConfirmPrepare] = React.useState(false)
  const pendingCount = users.filter((user) => user.status === "PENDING").length

  const actorRole = context?.currentUserRole ?? "ADMIN"
  // Só o dono dos dados (SUPERADMIN) manda mexer na estrutura do banco.
  const isOwner = actorRole === "SUPERADMIN"

  async function approve(userId: string) {
    setBusyId(userId)
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) throw new Error(payload?.message ?? t("approveError"))
      setUsers((current) => current.map((user) => (user.id === userId ? payload.data : user)))
      toast.success(t("approveSuccess"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("approveError"))
    } finally {
      setBusyId(null)
    }
  }

  async function changeRole(userId: string, role: UserRole) {
    setBusyId(userId)
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setRole", role }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) throw new Error(payload?.message ?? t("roleError"))
      setUsers((current) => current.map((user) => (user.id === userId ? payload.data : user)))
      toast.success(t("roleSuccess"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("roleError"))
    } finally {
      setBusyId(null)
    }
  }

  async function removeUser(user: AdminUserSummary) {
    setBusyId(user.id)
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) throw new Error(payload?.message ?? t("removeError"))
      setUsers((current) => current.filter((u) => u.id !== user.id))
      toast.success(t("removeSuccess"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("removeError"))
    } finally {
      setBusyId(null)
      setRemoveTarget(null)
    }
  }

  /** Única mudança de estrutura do sistema — e só o dono manda fazer. */
  async function prepareSharedAccount() {
    setPreparing(true)
    try {
      const response = await fetch("/api/admin/shared-account", { method: "POST" })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) throw new Error(payload?.message ?? t("sharedAccount.error"))
      setSharedAccount(payload.data)
      toast.success(t("sharedAccount.readyTitle"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("sharedAccount.error"))
    } finally {
      setPreparing(false)
      setConfirmPrepare(false)
    }
  }

  function roleControl(user: AdminUserSummary) {
    if (!context) return roleBadge(user.role, t)
    const isSelf = user.id === context.currentUserId
    const options = USER_ROLES.filter(
      (role) =>
        role === user.role ||
        canChangeRole({ actorRole, targetRole: user.role, newRole: role, isSelf, targetIsDataOwner: false }) === "ok",
    )
    if (options.length <= 1 || user.status !== "ACTIVE") return roleBadge(user.role, t)
    return (
      <Select value={user.role} onValueChange={(value) => changeRole(user.id, value as UserRole)} disabled={busyId === user.id}>
        <SelectTrigger className="h-8 w-[150px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((role) => (
            <SelectItem key={role} value={role}>
              {t(`roles.${role}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  function canRemove(user: AdminUserSummary) {
    if (!context) return false
    return (
      canRemoveUser({
        actorRole,
        targetRole: user.role,
        isSelf: user.id === context.currentUserId,
        targetIsDataOwner: false,
      }) === "ok"
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("pendingCount", { count: pendingCount })}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("usersTitle")}</CardTitle>
          <CardDescription>{t("usersDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              {t("noUsers")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("colUser")}</TableHead>
                    <TableHead>{t("colStatus")}</TableHead>
                    <TableHead>{t("colRole")}</TableHead>
                    <TableHead>{t("colDate")}</TableHead>
                    <TableHead className="text-right">{t("colAction")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="min-w-[220px]">
                        <div className="font-medium flex items-center gap-2">
                          {user.name}
                          {context && user.id === context.currentUserId && (
                            <Badge variant="secondary" className="text-[10px]">{t("you")}</Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">{user.email}</div>
                      </TableCell>
                      <TableCell>{statusBadge(user.status, t)}</TableCell>
                      <TableCell>{roleControl(user)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(user.createdAt, locale)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {user.status === "PENDING" ? (
                            <Button
                              type="button"
                              size="sm"
                              className="cursor-pointer"
                              disabled={busyId === user.id}
                              onClick={() => approve(user.id)}
                            >
                              <UserCheck className="size-4" />
                              {busyId === user.id ? t("approving") : t("approve")}
                            </Button>
                          ) : (
                            <Button type="button" size="sm" variant="outline" disabled>
                              <CheckCircle2 className="size-4" />
                              {t("approved")}
                            </Button>
                          )}
                          {canRemove(user) && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="cursor-pointer text-destructive hover:text-destructive"
                              aria-label={t("remove")}
                              disabled={busyId === user.id}
                              onClick={() => setRemoveTarget(user)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Convites: o banco precisa ganhar a estrutura, com a confirmação do dono */}
      {isOwner && sharedAccount && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserPlus className="size-4" />
              {sharedAccount.ready ? t("sharedAccount.readyTitle") : t("sharedAccount.title")}
            </CardTitle>
            <CardDescription>
              {sharedAccount.ready ? t("sharedAccount.readyDesc") : t("sharedAccount.desc")}
            </CardDescription>
          </CardHeader>
          {!sharedAccount.ready && (
            <CardContent className="space-y-3">
              <ul className="space-y-1.5 text-sm">
                {sharedAccount.missing.map((piece) => (
                  <li key={piece} className="flex items-start gap-2">
                    <Database className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <span>{piece === "column" ? t("sharedAccount.pieceColumn") : t("sharedAccount.pieceTable")}</span>
                  </li>
                ))}
              </ul>
              <p className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                {t("sharedAccount.safety")}
              </p>
              <Button
                type="button"
                className="cursor-pointer"
                disabled={preparing}
                onClick={() => setConfirmPrepare(true)}
              >
                <Database className="size-4" />
                {preparing ? t("sharedAccount.preparing") : t("sharedAccount.prepare")}
              </Button>
            </CardContent>
          )}
        </Card>
      )}

      <AlertDialog open={confirmPrepare} onOpenChange={(open) => !open && setConfirmPrepare(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sharedAccount.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("sharedAccount.confirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction className="cursor-pointer" onClick={prepareSharedAccount} disabled={preparing}>
              {t("sharedAccount.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação: remover */}
      <AlertDialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("removeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("removeDesc", { name: removeTarget?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="cursor-pointer bg-destructive text-white hover:bg-destructive/90"
              onClick={() => removeTarget && removeUser(removeTarget)}
            >
              {t("remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
