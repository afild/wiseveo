import { NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import { getSessionUserId } from "@/lib/session"
import { getAppUrl } from "@/lib/app-url"
import { AdminAccessError, requireAdminUser } from "@/features/settings/services/admin-users-service"
import {
  createInvitation,
  InvitationError,
  listPendingInvitations,
} from "@/features/settings/services/invitations-service"

export const dynamic = "force-dynamic"

async function errorResponse(error: unknown) {
  if (error instanceof AdminAccessError || error instanceof InvitationError) {
    return NextResponse.json({ success: false, message: error.message }, { status: error.status })
  }
  console.error("[api/admin/invitations] error:", error)
  const t = await getTranslations("api.errors")
  return NextResponse.json({ success: false, message: t("internalError") }, { status: 500 })
}

function isDemoMode() {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true"
}

export async function GET() {
  if (isDemoMode()) return new NextResponse(null, { status: 404 })
  try {
    const actorId = await getSessionUserId()
    await requireAdminUser(actorId)
    return NextResponse.json({ success: true, data: await listPendingInvitations(actorId as string) })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  if (isDemoMode()) return new NextResponse(null, { status: 404 })
  try {
    const actorId = await getSessionUserId()
    await requireAdminUser(actorId)
    const body = (await request.json().catch(() => ({}))) as { email?: unknown; role?: unknown }
    const invitation = await createInvitation({
      invitedById: actorId as string,
      // O e-mail é obrigatório: o convite é preso a ele (o serviço recusa se vier vazio).
      email: typeof body.email === "string" ? body.email.trim().slice(0, 254) : "",
      role: typeof body.role === "string" ? (body.role as "USER" | "ADMIN" | "SUPERADMIN") : undefined,
    })
    const link = `${getAppUrl(request)}/convite/${invitation.token}`
    return NextResponse.json({ success: true, data: { ...invitation, link } }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
