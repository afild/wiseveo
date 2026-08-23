import { NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import { COOKIE_NAME, createSessionToken } from "@/lib/auth"
import { applySessionLocaleCookie } from "@/i18n/session-locale"
import {
  acceptInvitationWithPassword,
  InvitationError,
} from "@/features/settings/services/invitations-service"

export const dynamic = "force-dynamic"

/** Tamanho mínimo de senha — o mesmo do cadastro comum. */
const MIN_PASSWORD = 8

/**
 * Aceite criando uma senha (quem não usa Google). Dá certo → a pessoa já sai daqui
 * com a sessão aberta, direto para o dashboard, sem passar por login nem por setup.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return new NextResponse(null, { status: 404 })
  const t = await getTranslations("api.invitations")
  try {
    const { token } = await params
    const body = (await request.json().catch(() => ({}))) as {
      name?: unknown
      email?: unknown
      password?: unknown
    }
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : ""
    const email = typeof body.email === "string" ? body.email.trim().slice(0, 254) : ""
    const password = typeof body.password === "string" ? body.password : ""

    if (!email || password.length < MIN_PASSWORD) {
      return NextResponse.json({ success: false, message: t("invalidForm") }, { status: 400 })
    }

    const { userId, preferencesJson } = await acceptInvitationWithPassword({ token, name, email, password })

    const response = NextResponse.json({ success: true })
    response.cookies.set(COOKIE_NAME, await createSessionToken(userId), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    })
    applySessionLocaleCookie(response, preferencesJson)
    return response
  } catch (error) {
    if (error instanceof InvitationError) {
      return NextResponse.json({ success: false, code: error.code, message: error.message }, { status: error.status })
    }
    console.error("[api/invitations/[token]/accept] error:", error)
    const tErrors = await getTranslations("api.errors")
    return NextResponse.json({ success: false, message: tErrors("internalError") }, { status: 500 })
  }
}
