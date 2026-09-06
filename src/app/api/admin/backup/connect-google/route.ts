import { NextResponse } from "next/server"
import { generateState, getGoogleDriveAuthUrl, isGoogleConfigured } from "@/lib/google-auth"
import { stateWithPurpose } from "@/lib/google-oauth-state"
import { isSuperAdminSession } from "@/lib/setup-access"
import { getAppUrl } from "@/lib/app-url"

/**
 * "Conectar o Google Drive". Só o SUPERADMIN, fora da demo (404 nos dois casos, como as
 * outras rotas admin). Grava o state, com o propósito `.backup`, no MESMO cookie do fluxo
 * da Agenda, porque o Google devolve tudo pelo callback da Agenda.
 */
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true" || !(await isSuperAdminSession())) {
    return new NextResponse(null, { status: 404 })
  }
  const appUrl = getAppUrl(request)
  if (!isGoogleConfigured()) {
    return NextResponse.redirect(`${appUrl}/configuracoes?tab=integrations&backup=google_not_configured`)
  }
  // O sufixo entra ANTES do cookie: o callback compara o state por igualdade estrita, e
  // guardar o valor cru aqui mataria todo consentimento do Drive em `invalid_state`.
  const state = stateWithPurpose(generateState(), "backup")
  const response = NextResponse.redirect(getGoogleDriveAuthUrl(state, appUrl))
  response.cookies.set("google_calendar_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  })
  return response
}
