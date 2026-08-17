import { NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import { createSessionToken, COOKIE_NAME } from "@/lib/auth"
import { acceptInvitationWithPassword, InvitationError } from "@/features/settings/services/invitations-service"

export const dynamic = "force-dynamic"

/** Aceite por senha: cria o membro já ativo dentro da conta de quem convidou e abre a sessão. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return new NextResponse(null, { status: 404 })
  const t = await getTranslations("api.invitations")
  const tAuth = await getTranslations("api.auth")

  try {
    const { token } = await params
    const body = (await request.json().catch(() => ({}))) as { name?: unknown; email?: unknown; password?: unknown }
    const name = typeof body.name === "string" ? body.name.trim() : ""
    const email = typeof body.email === "string" ? body.email.trim() : ""
    const password = typeof body.password === "string" ? body.password : ""

    if (!name || !email || !password) {
      return NextResponse.json({ success: false, message: tAuth("allFieldsRequired") }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ success: false, message: tAuth("passwordTooShort") }, { status: 400 })
    }

    const { userId } = await acceptInvitationWithPassword({ token, name, email, password })
    const sessionToken = await createSessionToken(userId)

    const response = NextResponse.json({ success: true, message: t("accepted"), redirectTo: "/dashboard" })
    response.cookies.set(COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    })
    return response
  } catch (error) {
    if (error instanceof InvitationError) {
      return NextResponse.json({ success: false, code: error.code, message: error.message }, { status: error.status })
    }
    console.error("[POST /api/invitations/accept] error:", error instanceof Error ? error.message : error)
    const tErrors = await getTranslations("api.errors")
    return NextResponse.json({ success: false, message: tErrors("internalError") }, { status: 500 })
  }
}
