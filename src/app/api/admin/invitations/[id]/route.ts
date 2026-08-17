import { NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import { getSessionUserId } from "@/lib/session"
import { AdminAccessError, requireAdminUser } from "@/features/settings/services/admin-users-service"
import { InvitationError, revokeInvitation } from "@/features/settings/services/invitations-service"

export const dynamic = "force-dynamic"

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return new NextResponse(null, { status: 404 })
  const t = await getTranslations("api.invitations")
  try {
    const actorId = await getSessionUserId()
    await requireAdminUser(actorId)
    const { id } = await params
    await revokeInvitation(actorId as string, id)
    return NextResponse.json({ success: true, message: t("revoked") })
  } catch (error) {
    if (error instanceof AdminAccessError || error instanceof InvitationError) {
      return NextResponse.json({ success: false, message: error.message }, { status: error.status })
    }
    const tErrors = await getTranslations("api.errors")
    return NextResponse.json({ success: false, message: tErrors("internalError") }, { status: 500 })
  }
}
