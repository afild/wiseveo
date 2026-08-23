import { NextResponse } from "next/server"
import { generateState, getGoogleAuthUrl, GOOGLE_INVITE_COOKIE, isGoogleConfigured } from "@/lib/google-auth"
import { getAppUrl } from "@/lib/app-url"
import { INVITE_TOKEN_PATTERN } from "@/features/settings/lib/invitation-rules"

export async function GET(request: Request) {
  const appUrl = getAppUrl(request)

  if (!isGoogleConfigured()) {
    return NextResponse.redirect(`${appUrl}/login?error=google_not_configured`)
  }

  const state = generateState()
  const authUrl = getGoogleAuthUrl(state, appUrl)

  const response = NextResponse.redirect(authUrl)

  response.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10, // 10 minutes
    path: "/",
  })

  // Aceite de convite pelo Google: o token viaja num cookie curto e é consumido pelo
  // callback, que só o aceita se o e-mail da conta Google for o do convite.
  const invite = new URL(request.url).searchParams.get("invite")
  if (invite && INVITE_TOKEN_PATTERN.test(invite)) {
    response.cookies.set(GOOGLE_INVITE_COOKIE, invite, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 10,
      path: "/",
    })
  }

  return response
}
