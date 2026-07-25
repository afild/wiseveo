"use client"

import * as React from "react"
import { toast } from "sonner"
import { CheckCircle2, ShieldCheck, UserCheck } from "lucide-react"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { AdminUserSummary } from "../services/admin-users-service"
import { useLocale, useTranslations } from "next-intl"
import { createDateFormatter } from "@/i18n/format"

interface AdminUsersFormProps {
  initialUsers: AdminUserSummary[]
}

function statusBadge(status: AdminUserSummary["status"], t: any) {
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

function roleBadge(role: AdminUserSummary["role"]) {
  if (role === "ADMIN" || role === "SUPERADMIN") {
    return (
      <Badge variant="outline" className="gap-1">
        <ShieldCheck className="size-3" />
        {role}
      </Badge>
    )
  }

  // i18n-ignore: role enum code rendered as-is, consistent with the raw {role} badge above
  return <Badge variant="outline">USER</Badge>
}

function formatDate(value: string, locale: string) {
  return createDateFormatter(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value))
}

export function AdminUsersForm({ initialUsers }: AdminUsersFormProps) {
  const t = useTranslations("settings.adminUsers")
  const locale = useLocale()
  const [users, setUsers] = React.useState(initialUsers)
  const [approvingId, setApprovingId] = React.useState<string | null>(null)
  const pendingCount = users.filter((user) => user.status === "PENDING").length

  async function approve(userId: string) {
    setApprovingId(userId)

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message ?? t("approveError"))
      }

      setUsers((current) =>
        current.map((user) =>
          user.id === userId ? payload.data : user,
        ),
      )
      toast.success(t("approveSuccess"))
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("approveError"),
      )
    } finally {
      setApprovingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">
          {t("pendingCount", { count: pendingCount })}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("usersTitle")}</CardTitle>
          <CardDescription>
            {t("usersDesc")}
          </CardDescription>
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
                        <div className="font-medium">{user.name}</div>
                        <div className="text-sm text-muted-foreground">{user.email}</div>
                      </TableCell>
                      <TableCell>{statusBadge(user.status, t)}</TableCell>
                      <TableCell>{roleBadge(user.role)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(user.createdAt, locale)}
                      </TableCell>
                      <TableCell className="text-right">
                        {user.status === "PENDING" ? (
                          <Button
                            type="button"
                            size="sm"
                            className="cursor-pointer"
                            disabled={approvingId === user.id}
                            onClick={() => approve(user.id)}
                          >
                            <UserCheck className="size-4" />
                            {approvingId === user.id ? t("approving") : t("approve")}
                          </Button>
                        ) : (
                          <Button type="button" size="sm" variant="outline" disabled>
                            <CheckCircle2 className="size-4" />
                            {t("approved")}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
