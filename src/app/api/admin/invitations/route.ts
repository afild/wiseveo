import { NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import { getSessionUserId } from "@/lib/session"
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
  const t = await getTranslations("api.errors")
  return NextResponse.json(
    { success: false, message: error instanceof Error ? error.message : t("internalError") },
    { status: 500 },
  )
}

function isDemoMode() {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true"
}

export async function GET() {
  if (isDemoMode()) return new NextResponse(null, { status: 404 })
  try {
    const actorId = await getSessionUserId()
    await requireAdminUser(actorId)
    const invitations = await listPendingInvitations(actorId as string)
    return NextResponse.json({ success: true, data: invitations })
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
    const email = typeof body.email === "string" ? body.email.trim().slice(0, 254) : null
    const invitation = await createInvitation({
      invitedById: actorId as string,
      email,
      role: typeof body.role === "string" ? (body.role as "USER" | "ADMIN" | "SUPERADMIN") : undefined,
    })
    const origin = new URL(request.url).origin
    const link = `${process.env.NEXT_PUBLIC_APP_URL || origin}/convite/${invitation.token}`
    return NextResponse.json({ success: true, data: { ...invitation, link } }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
