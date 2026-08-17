"use client"

import * as React from "react"
import { toast } from "sonner"
import { CheckCircle2, Copy, Link2, ShieldCheck, Trash2, UserCheck, UserPlus, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import type { InvitationSummary } from "../services/invitations-service"
import { canChangeRole, canRemoveUser, invitableRoles, USER_ROLES, type UserRole } from "@/lib/user-roles"
import { useLocale, useTranslations } from "next-intl"
import { createDateFormatter } from "@/i18n/format"

interface AdminContext {
  currentUserId: string
  currentUserRole: UserRole
  dataOwnerId: string
  invitations: InvitationSummary[]
  invitationsEnabled: boolean
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
  const locale = useLocale()
  const [users, setUsers] = React.useState(initialUsers)
  const [invitations, setInvitations] = React.useState<InvitationSummary[]>(context?.invitations ?? [])
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = React.useState(false)
  const [inviteEmail, setInviteEmail] = React.useState("")
  const [inviteRole, setInviteRole] = React.useState<UserRole>("USER")
  const [inviteLink, setInviteLink] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [removeTarget, setRemoveTarget] = React.useState<AdminUserSummary | null>(null)
  const pendingCount = users.filter((user) => user.status === "PENDING").length

  const actorRole = context?.currentUserRole ?? "ADMIN"
  const rolesToInvite = invitableRoles(actorRole)
  const canInvite = Boolean(context?.invitationsEnabled) && rolesToInvite.length > 0

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

  async function createInvite() {
    setCreating(true)
    try {
      const response = await fetch("/api/admin/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim() || null, role: inviteRole }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) throw new Error(payload?.message ?? t("invitations.createError"))
      setInviteLink(payload.data.link)
      setInvitations((current) => [payload.data, ...current])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("invitations.createError"))
    } finally {
      setCreating(false)
    }
  }

  async function revokeInvite(id: string) {
    setBusyId(id)
    try {
      const response = await fetch(`/api/admin/invitations/${id}`, { method: "DELETE" })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) throw new Error(payload?.message ?? t("invitations.revokeError"))
      setInvitations((current) => current.filter((i) => i.id !== id))
      toast.success(t("invitations.revokeSuccess"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("invitations.revokeError"))
    } finally {
      setBusyId(null)
    }
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link)
      toast.success(t("invitations.copied"))
    } catch {
      toast.error(t("invitations.copyError"))
    }
  }

  function closeInviteDialog() {
    setInviteOpen(false)
    setInviteLink(null)
    setInviteEmail("")
    setInviteRole("USER")
  }

  function roleControl(user: AdminUserSummary) {
    if (!context) return roleBadge(user.role, t)
    const isSelf = user.id === context.currentUserId
    const targetIsDataOwner = user.id === context.dataOwnerId
    const options = USER_ROLES.filter(
      (role) =>
        role === user.role ||
        canChangeRole({ actorRole: actorRole, targetRole: user.role, newRole: role, isSelf, targetIsDataOwner }) === "ok",
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
        targetIsDataOwner: user.id === context.dataOwnerId,
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
        {canInvite && (
          <Button type="button" className="cursor-pointer" onClick={() => setInviteOpen(true)}>
            <UserPlus className="size-4" />
            {t("invitations.inviteButton")}
          </Button>
        )}
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
                          {context && user.id === context.dataOwnerId && (
                            <Badge variant="secondary" className="text-[10px] gap-1">
                              <Users className="size-3" />
                              {t("accountOwner")}
                            </Badge>
                          )}
                          {user.isMember && (
                            <Badge variant="outline" className="text-[10px]">{t("member")}</Badge>
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

      {canInvite && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("invitations.title")}</CardTitle>
            <CardDescription>{t("invitations.desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {invitations.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                {t("invitations.none")}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("invitations.colEmail")}</TableHead>
                      <TableHead>{t("colRole")}</TableHead>
                      <TableHead>{t("invitations.colInvitedBy")}</TableHead>
                      <TableHead>{t("invitations.colExpires")}</TableHead>
                      <TableHead className="text-right">{t("colAction")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invitations.map((invitation) => (
                      <TableRow key={invitation.id}>
                        <TableCell className="text-sm">
                          {invitation.email ?? <span className="text-muted-foreground">{t("invitations.anyEmail")}</span>}
                        </TableCell>
                        <TableCell>{roleBadge(invitation.role, t)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{invitation.invitedByName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(invitation.expiresAt, locale)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="cursor-pointer text-destructive hover:text-destructive"
                            disabled={busyId === invitation.id}
                            onClick={() => revokeInvite(invitation.id)}
                          >
                            {t("invitations.revoke")}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Diálogo: convidar */}
      <Dialog open={inviteOpen} onOpenChange={(open) => (open ? setInviteOpen(true) : closeInviteDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("invitations.dialogTitle")}</DialogTitle>
            <DialogDescription>{t("invitations.dialogDesc")}</DialogDescription>
          </DialogHeader>
          {inviteLink ? (
            <div className="space-y-3">
              <p className="text-sm">{t("invitations.linkReady")}</p>
              <div className="flex items-center gap-2">
                <Input readOnly value={inviteLink} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                <Button type="button" variant="secondary" className="cursor-pointer shrink-0" onClick={() => copyLink(inviteLink)}>
                  <Copy className="size-4" />
                  {t("invitations.copy")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <Link2 className="size-3.5 mt-0.5 shrink-0" />
                {t("invitations.linkHint")}
              </p>
              <DialogFooter>
                <Button type="button" onClick={closeInviteDialog} className="cursor-pointer">
                  {t("invitations.done")}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="invite-email">{t("invitations.emailLabel")}</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder={t("invitations.emailPlaceholder")}
                />
                <p className="text-xs text-muted-foreground">{t("invitations.emailHint")}</p>
              </div>
              {rolesToInvite.length > 1 && (
                <div className="space-y-1.5">
                  <Label>{t("colRole")}</Label>
                  <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as UserRole)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {rolesToInvite.map((role) => (
                        <SelectItem key={role} value={role}>
                          {t(`roles.${role}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeInviteDialog} className="cursor-pointer">
                  {t("invitations.cancel")}
                </Button>
                <Button type="button" onClick={createInvite} disabled={creating} className="cursor-pointer">
                  <Link2 className="size-4" />
                  {creating ? t("invitations.creating") : t("invitations.generate")}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
            <AlertDialogCancel className="cursor-pointer">{t("invitations.cancel")}</AlertDialogCancel>
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
