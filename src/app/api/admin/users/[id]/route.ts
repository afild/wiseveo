import { NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import { getSessionUserId } from "@/lib/session"
import {
  AdminAccessError,
  approveUser,
  removeUser,
  requireAdminUser,
  setUserRole,
} from "@/features/settings/services/admin-users-service"

export const dynamic = "force-dynamic"

async function errorResponse(error: unknown) {
  if (error instanceof AdminAccessError) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: error.status },
    )
  }

  const t = await getTranslations("api.errors")
  const message = error instanceof Error ? error.message : t("internalError")

  return NextResponse.json({ success: false, message }, { status: 500 })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Mesma trava de demo das outras rotas /api/admin/* : a aba Admin da demo é
  // ilustrativa e nunca chama o servidor.
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return new NextResponse(null, { status: 404 })
  const t = await getTranslations("api.admin")

  try {
    const actorId = await getSessionUserId()
    await requireAdminUser(actorId)

    const body = await request.json().catch(() => null)
    const { id } = await params

    if (body?.action === "approve") {
      const user = await approveUser(id)
      return NextResponse.json({ success: true, message: t("userApproved"), data: user })
    }

    if (body?.action === "setRole") {
      const user = await setUserRole(actorId as string, id, body.role)
      return NextResponse.json({ success: true, message: t("roleUpdated"), data: user })
    }

    return NextResponse.json({ success: false, message: t("invalidAction") }, { status: 400 })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return new NextResponse(null, { status: 404 })
  const t = await getTranslations("api.admin")

  try {
    const actorId = await getSessionUserId()
    await requireAdminUser(actorId)
    const { id } = await params
    await removeUser(actorId as string, id)
    return NextResponse.json({ success: true, message: t("userRemoved") })
  } catch (error) {
    return errorResponse(error)
  }
}
